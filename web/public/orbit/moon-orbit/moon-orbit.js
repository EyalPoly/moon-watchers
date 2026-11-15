import {clamp,cross,dot,unit,rotation,mult,viewAt,layout,earthFrame,OPENING_VIEW,validateFrame} from './math.js';
const DEFAULT={sun:[-.61035,.79182,-.02228],earth:[.99344,.02921,.11058]};
const I=[1,0,0,0,1,0,0,0,1];
/**
 * createMoonOrbit(host, {directions, view, assetBase, three, onError, signal})
 * No app globals, clock, controller IDs or astronomy service. See README.md or INTEGRATION_HE.md in the kit.
 */
export async function createMoonOrbit(host,options={}){
 if(!host||host.nodeType!==1)throw TypeError('An HTML container with an explicit height is required');
 const abort=new AbortController();if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const base=new URL(options.assetBase||'./assets/',import.meta.url);
 if(!base.pathname.endsWith('/'))base.pathname+='/';
 const shell=document.createElement('div');shell.className='moon-orbit-viewer';shell.style.cssText='position:relative;width:100%;height:100%;min-width:0;overflow:hidden;';
 // Validate host state before attaching DOM or allocating renderer resources.
 let cam=viewAt(options.view?.longitude??OPENING_VIEW.longitude,options.view?.latitude??OPENING_VIEW.latitude);
 let zoom=1;
 let dirs={sun:unit(options.directions?.sun||DEFAULT.sun),earth:unit(options.directions?.earth||DEFAULT.earth)};
 let fixed=options.directions?.earthFixedToMoon?validateFrame(options.directions.earthFixedToMoon):I.slice();
 const sh=shell.attachShadow({mode:'open'});
 const edgeIcon='<svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.6 4.4 12.2 8l-3.6 3.6"/></svg>';
 const backIcon='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 12V7.5a4 4 0 0 0-8 0v1.8m-2.4-2L5 9.8l2.6-2.5"/></svg>';
 const skyUI=['Sun','Earth'].map((name,i)=>'<div class="body '+(i?'earth':'sun')+'" aria-hidden="true"><span class="tag">'+name+'</span><span class="pin">'+edgeIcon+name+'</span><span class="back">'+backIcon+name+' · Behind you</span></div>').join('');
 sh.innerHTML='<style>:host{display:block}*{box-sizing:border-box}.stage{position:absolute;inset:0;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;outline:none}.stage.grab{cursor:grabbing}.stage:focus-visible{outline:1px dashed #8b9f7e;outline-offset:-7px}.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}.body{--ink:#efe1bd;--accent:#e8c18c;position:absolute;inset:0;pointer-events:none}.body.earth{--ink:#d3e2ed;--accent:#a2c2d7}.tag,.pin,.back{position:absolute;color:var(--ink);white-space:nowrap;opacity:0;font:500 12px/1.2 system-ui,sans-serif;letter-spacing:.025em;text-shadow:0 1px 4px #04070a}.tag{transform:translate(-50%,0)}.pin,.back{display:inline-flex;align-items:center;gap:6px;transform:translate(-50%,-50%);border-radius:20px;border:1px solid #404747b0;background:#10171ac7;padding:4px 9px;font-size:11px;line-height:15px}.pin svg,.back svg{width:13px;height:13px;fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:560px){.tag{font-size:11px}.pin,.back{padding:3px 7px;font-size:10px;gap:4px}.pin svg,.back svg{width:12px;height:12px}}</style><div class="stage" tabindex="0" role="group" aria-label="Orbit around the Moon. Drag or use the arrow keys. Edge arrows point toward the Sun or Earth outside the view." aria-describedby="sky-state" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"><canvas aria-hidden="true"></canvas>'+skyUI+'<span class="sr" id="sky-state"></span></div>';
 host.append(shell);const stage=sh.querySelector('.stage'),skyState=sh.querySelector('#sky-state');
 const annotations=Array.from(sh.querySelectorAll('.body'),body=>({tag:body.querySelector('.tag'),pin:body.querySelector('.pin'),arrow:body.querySelector('.arrow'),back:body.querySelector('.back')}));
 let canvas=sh.querySelector('canvas'),backend=null,disposed=false,hold=null,raf=0,fine=false,assets={},recovering=false;
 let dims=null,settle;const detailed=new Promise(r=>{settle=r;});const loaded=new Set();
 const cleanups=[];
 const listen=(target,event,fn,o)=>{target.addEventListener(event,fn,o);cleanups.push(()=>target.removeEventListener(event,fn,o));};
 async function im(name){
  const res=await fetch(new URL(name,base),{signal:abort.signal});if(!res.ok)throw Error('Surface asset '+name+': '+res.status);
  const b=await res.blob();let image;
  if(typeof createImageBitmap==='function'){try{image=await createImageBitmap(b,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});}catch(_){}}
  if(!image){const url=URL.createObjectURL(b);try{image=await new Promise((yes,no)=>{const img=new Image();img.onload=()=>yes(img);img.onerror=()=>no(Error('Unreadable image '+name));img.src=url;});}finally{URL.revokeObjectURL(url);}}
  if(disposed){image.close?.();throw new DOMException('Disposed','AbortError');}loaded.add(image);return image;
 }
 function replaceCanvas(){const n=document.createElement('canvas');n.setAttribute('aria-hidden','true');canvas.replaceWith(n);canvas=n;}
 const report=e=>{if(!disposed)options.onError?.(e);};
 async function software(){
  if(disposed)return;backend?.dispose();backend=null;replaceCanvas();const {makeSoftware}=await import('./software-renderer.js');
  if(disposed)return;backend=makeSoftware(canvas);shell.dataset.renderer=backend.kind;
  if(assets.albedo)backend.maps(assets);
 }
 async function recover(err){
  if(disposed||recovering)return;recovering=true;
  try {await software();invalidate();}catch(e){report(e);}
  finally {recovering=false;}
 }
 function redraw(){
  raf=0;if(disposed||!backend||!assets.albedo)return;
  const w=shell.clientWidth,h=shell.clientHeight;if(w<2||h<2)return;
  dims=layout(w,h,cam,dirs.sun,dirs.earth,zoom);
  const ef=earthFrame(cam,dirs.earth,dirs.sun,fixed);
  try{backend.draw(cam,dirs,dims,ef,!!hold||scrubbing);}catch(err){
   if(backend.kind!=='software'){console.warn('Moon Watchers: hardware renderer unavailable; using the software path.',err);void recover(err);}
   else report(err);return;
  }
  const labels=[];
  [dims.sun,dims.earth].forEach((b,i)=>{
   const a=annotations[i];
   function mark(el,x,y,opacity){
    if(opacity<=.001){el.style.visibility='hidden';return;}
    el.style.visibility='visible';el.style.left=x+'px';el.style.top=y+'px';el.style.opacity=opacity.toFixed(3);
   }
   mark(a.tag,clamp(b.x,24,w-24),clamp(b.y+b.r+6,8,h-17),b.tag);
   mark(a.pin,b.pin.x,b.pin.y,b.pinAlpha);
   if(b.pinAlpha>.001)a.arrow.style.transform='rotate('+b.angle+'rad)';
   mark(a.back,clamp(w*(i?.74:.26),58,Math.max(58,w-58)),Math.max(22,h-55),b.backAlpha);
   labels.push((i?'Earth':'Sun')+': '+(b.state==='occulted'?'hidden by the Moon':b.state==='visible'?'in the sky':b.backAlpha>.55?'behind you':'outside the view')+'.');
  });
  const desc=labels.join(' ');if(skyState.textContent!==desc)skyState.textContent=desc;
  // The host's site pins use the same orthographic camera as both renderers.
  if(options.onFrame){
   const basis=cam, {cx,cy,rad}=dims;
   options.onFrame((longitude,latitude)=>{
    const lon=longitude*Math.PI/180, lat=latitude*Math.PI/180;
    const normal=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
    const along=offset=>normal[0]*basis[offset]+normal[1]*basis[offset+1]+normal[2]*basis[offset+2];
    const x=cx+rad*along(0), y=cy-rad*along(3);
    return {x,y,visible:along(6)>0 && x>=0 && x<w && y>=0 && y<h};
   });
  }
 }
 function invalidate(){if(!raf&&!disposed)raf=requestAnimationFrame(redraw);}
 function setDirections(next){
  if(disposed)return;if(!next?.sun||!next?.earth)throw TypeError('setDirections requires {sun:[x,y,z], earth:[x,y,z]}');
  const s=unit(next.sun),e=unit(next.earth),f=next.earthFixedToMoon?validateFrame(next.earthFixedToMoon):fixed;
  dirs={sun:s,earth:e};fixed=f;invalidate();
 }
 function setView(v){if(disposed)return;cam=viewAt(v.longitude,v.latitude);if(v.zoom!=null)zoom=clamp(v.zoom,.65,3);invalidate();}
 function zoomBy(factor){if(!disposed && Number.isFinite(factor) && factor>0){zoom=clamp(zoom*factor,.65,3);invalidate();}}
 let scrubbing=false;
 function setInteracting(v){scrubbing=!!v;invalidate();}
 function ball(ev){const b=shell.getBoundingClientRect(),l=dims||layout(b.width,b.height,cam,dirs.sun,dirs.earth,zoom);let x=(ev.clientX-b.left-l.cx)/l.rad,y=(l.cy+b.top-ev.clientY)/l.rad;const rr=x*x+y*y;if(rr>=1){const k=1/Math.sqrt(rr);return [x*k,y*k,0];}return [x,y,Math.sqrt(1-rr)];}
 listen(stage,'wheel',e=>{
  e.preventDefault();
  const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?shell.clientHeight:1);
  zoomBy(Math.exp(-clamp(pixels,-300,300)*.0018));
 },{passive:false});
 listen(stage,'pointerdown',e=>{if(e.isPrimary===false||e.button!==0||hold)return;e.preventDefault();stage.setPointerCapture(e.pointerId);hold={v:ball(e),id:e.pointerId};stage.classList.add('grab');});
 listen(stage,'pointermove',e=>{if(!hold||hold.id!==e.pointerId)return;const a=ball(e),b=hold.v,c=cross(a,b);
  cam=mult(cam,rotation(...c,1+dot(a,b)));hold.v=a;invalidate();});
 const end=e=>{if(hold&&hold.id===e.pointerId){hold=null;stage.classList.remove('grab');invalidate();}};
 for(const key of ['pointerup','pointercancel','lostpointercapture'])listen(stage,key,end);
 listen(stage,'keydown',e=>{const a=(e.shiftKey?18:6)*Math.PI/360,s=Math.sin(a);
  const axis={ArrowLeft:[0,s,0],ArrowRight:[0,-s,0],ArrowUp:[s,0,0],ArrowDown:[-s,0,0]}[e.key];
  if(axis){e.preventDefault();cam=mult(cam,rotation(...axis,Math.cos(a)));invalidate();}});
 const ro=new ResizeObserver(invalidate);ro.observe(shell);
 function dispose(){if(disposed)return;disposed=true;abort.abort();cancelAnimationFrame(raf);raf=0;ro.disconnect();cleanups.forEach(f=>f());backend?.dispose();backend=null;for(const im of loaded)im.close?.();loaded.clear();shell.remove();settle({quality:'disposed'});}
 if(options.signal)listen(options.signal,'abort',dispose,{once:true});
 async function loadDetails(){
  if(disposed)return;
  try{
   const [a,g,n,s]=await Promise.all(['albedo.webp','height-global.webp','height-north.webp','height-south.webp'].map(im));
   if(disposed)return;
   const oldA=assets.albedo,oldH=assets.height;
   assets={albedo:a,height:g,north:n,south:s,earth:assets.earth,fine:true};fine=true;backend?.maps(assets);redraw();
   for(const old of [oldA,oldH]){if(loaded.has(old)){old.close?.();loaded.delete(old);}}
   shell.dataset.quality='full';settle({quality:'full'});
  }catch(err){if(!disposed){report(err);shell.dataset.quality='preview';settle({quality:'preview',error:String(err)});}}
 }
 try{
  const quick=Promise.all(['albedo-quick.webp','height-quick.webp','earth.webp'].map(im));
  const init=(async()=>{
   let gl=null;try{gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power',stencil:false});}catch(_){}
   if(gl){
    try{const [T,mod]=await Promise.all([options.three||import('./vendor/three.module.min.js'),import('./three-renderer.js')]);
     if(disposed)return;backend=mod.makeThree(T,canvas,{gl});shell.dataset.renderer=backend.kind;
     listen(canvas,'webglcontextlost',e=>{e.preventDefault();void recover(Error('WebGL context lost'));},{once:true});return;
    }catch(err){console.warn('Moon Watchers: using the software renderer.',err);}
   }
   await software();
  })();
  const [images]=await Promise.all([quick,init]);if(disposed)throw new DOMException('Disposed','AbortError');
  assets={albedo:images[0],height:images[1],earth:images[2],fine:false};backend.maps(assets);shell.dataset.quality='preview';redraw();
  // Present the first frame before the larger, independent detail download.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!disposed)void loadDetails();}));
  return {setDirections,setView,zoomBy,setInteracting,dispose,ready:detailed,
    get rendererType(){return backend?.kind||'disposed';},get detailReady(){return fine;}};
 }catch(err){dispose();throw err;}
}

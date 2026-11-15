// Graceful software rendering for browsers without a WebGL 2 context.
import {RADIUS_M as R,clamp} from './math.js';
export function makeSoftware(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Neither WebGL 2 nor Canvas 2D is available');
 const cache=new Map(), PI=Math.PI,off=document.createElement('canvas'),oc=off.getContext('2d',{alpha:true});
 let alb,hg,no,so,et,fine=false,image,nOld=0;
 function raster(im,height=false){
  if(!im)return null;if(cache.has(im))return cache.get(im);
  const c=document.createElement('canvas'),w=im.width||im.naturalWidth,h=im.height||im.naturalHeight;c.width=w;c.height=h;
  const cc=c.getContext('2d',{willReadFrequently:true});cc.drawImage(im,0,0);const rgba=cc.getImageData(0,0,w,h).data;
  const r={w,h,rgba};if(height){r.alt=new Float32Array(w*h);for(let i=0;i<w*h;i++)r.alt[i]=(rgba[i*4]*256+rgba[i*4+1])*8-12000;}
  c.width=c.height=1;cache.set(im,r);return r;
 }
 function maps(m){alb=raster(m.albedo);hg=raster(m.height,true);no=raster(m.north,true);so=raster(m.south,true);et=raster(m.earth);fine=m.fine;
  for(const k of cache.keys())if(![m.albedo,m.height,m.north,m.south,m.earth].includes(k))cache.delete(k);
 }
 function sampleH(a,u,v,wr){
  let sx=u*a.w-.5,sy=clamp(v*a.h-.5,0,a.h-1);
  sx=wr?(sx+a.w)%a.w:clamp(sx,0,a.w-1);
  const x=Math.floor(sx),y=Math.floor(sy),xx=wr?(x+1)%a.w:Math.min(a.w-1,x+1),yy=Math.min(y+1,a.h-1),f=sx-x,t=sy-y;
  return (1-t)*(a.alt[y*a.w+x]*(1-f)+a.alt[y*a.w+xx]*f)+t*(a.alt[yy*a.w+x]*(1-f)+a.alt[yy*a.w+xx]*f);
 }
 const sm=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 function mixcap(z){return no&&so?sm((Math.abs(z)-.9702957263)/(.9848077530-.9702957263)):0;}
 function llU(x,y){return (Math.atan2(y,x)/(2*PI)+1.5)%1;}
 function llV(z){return .5-Math.asin(clamp(z,-1,1))/PI;}
 function hgt(x,y,z){
  const f=mixcap(z);
  let ch=0;if(f>.001){const d=(1+Math.abs(z))*.1316524976;ch=sampleH(z>0?no:so,.5+.5*x/d,.5-.5*y/d,false);if(f>.999)return ch;}
  return (1-f)*sampleH(hg,llU(x,y),llV(z),true)+f*ch;
 }
 function hnorm(x,y,z){const r=1/Math.sqrt(x*x+y*y+z*z);return hgt(x*r,y*r,z*r);}
 function ix(a,u,v){return (clamp(Math.floor(v*a.h),0,a.h-1)*a.w+clamp(Math.floor(u*a.w),0,a.w-1))*4;}
 function draw(m,dirs,l,ef,moving){
  const {w,h,cx,cy,rad}=l,dpr=Math.min(devicePixelRatio||1,1.3);const cw=Math.max(1,Math.round(w*dpr)),ch=Math.max(1,Math.round(h*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(cw/w,0,0,ch/h,0,0);ctx.clearRect(0,0,w,h);
  const n=Math.max(48,Math.min(moving?210:540,Math.round(2*rad*dpr))),half=n/2,pr=half/1.008;
  if(nOld!==n){off.width=off.height=n;image=oc.createImageData(n,n);nOld=n;}const out=image.data;out.fill(0);
  const [sx,sy,sz]=dirs.sun;
  for(let j=0;j<n;j++){const yy=(half-j-.5)/pr;for(let i=0;i<n;i++){
   const xx=(i+.5-half)/pr,r2=xx*xx+yy*yy;if(r2>1.015)continue;
   let radius=1,zz=Math.sqrt(Math.max(0,1-r2)),x=m[0]*xx+m[3]*yy+m[6]*zz,y=m[1]*xx+m[4]*yy+m[7]*zz,z=m[2]*xx+m[5]*yy+m[8]*zz;
   let h0=hgt(x,y,z);
   // Near the silhouette, intersect the locally displaced surface twice.
   if(r2>.93){for(let t=0;t<2;t++){radius=1+h0/R;zz=Math.sqrt(Math.max(0,radius*radius-r2));
     let a=m[0]*xx+m[3]*yy+m[6]*zz,b=m[1]*xx+m[4]*yy+m[7]*zz,c=m[2]*xx+m[5]*yy+m[8]*zz,iv=1/Math.sqrt(a*a+b*b+c*c);
     x=a*iv;y=b*iv;z=c*iv;h0=hgt(x,y,z);}
   }
   const alpha=clamp((radius-Math.sqrt(r2))*pr+.5,0,1);if(!alpha)continue;
   const fl=mixcap(z),mu=x*sx+y*sy+z*sz,eps=((fine?.0017:.006)*(1-fl)+.00068*fl);
   const rr=Math.sqrt(x*x+y*y),ex=rr>1e-6?-y/rr:0,ey=rr>1e-6?x/rr:1,nx=-z*ey,ny=z*ex,nz=rr;
   let lum=.049;
   if(mu>-.145){
    const de=(hnorm(x+eps*ex,y+eps*ey,z)-hnorm(x-eps*ex,y-eps*ey,z))/(2*eps*R);
    const dn=(hnorm(x+eps*nx,y+eps*ny,z+eps*nz)-hnorm(x-eps*nx,y-eps*ny,z-eps*nz))/(2*eps*R);
    let a=x-1.17*(de*ex+dn*nx),b=y-1.17*(de*ey+dn*ny),c=z-1.17*dn*nz,iv=1/Math.sqrt(a*a+b*b+c*c);a*=iv;b*=iv;c*=iv;
    const nd=Math.max(0,a*sx+b*sy+c*sz),nv=Math.max(.115,a*m[6]+b*m[7]+c*m[8]);let vis=1;
    if(nd>.0002&&mu<.45){let d=(1-fl)*(fine?1650:3800)+fl*970,worst=-1,org=1+(h0+9)/R;const steps=moving?7:13,mul=moving?2.22:1.55;
     for(let k=0;k<steps;k++){const scale=d/R,qx=x*org+sx*scale,qy=y*org+sy*scale,qz=z*org+sz*scale,radial=Math.sqrt(qx*qx+qy*qy+qz*qz);
      worst=Math.max(worst,(hgt(qx/radial,qy/radial,qz/radial)-(radial-1)*R)/d);d*=mul;if(worst>.005)break;}
     vis=1-sm((worst+.00465)/.0093);
    }
    lum+=Math.pow(Math.max(0,vis*(.54*2*nd/(nd+nv+.0001)+.46*nd)),.67);
   }
   const ai=ix(alb,llU(x,y),llV(z));let cb=0;
   if(fl){const d=(1+Math.abs(z))*.1316524976,cap=z>0?no:so;cb=cap.rgba[ix(cap,.5+.5*x/d,.5-.5*y/d)+2];}
   const oi=4*(j*n+i);for(let k=0;k<3;k++){const v=(1-fl)*alb.rgba[ai+k]+fl*cb;out[oi+k]=Math.max(.025,(v/255-.5)*1.18+.51)*1.11*lum*255;}
   out[oi+3]=alpha*255;
  }}
  oc.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;
  // Draw the far sky first. Its bodies and the solar halo cannot cross in
  // front of the Moon, even when both sky directions enter the same pixel.
  if(l.sun.draw)paintSun();if(l.earth.draw)paintEarth();
  ctx.drawImage(off,cx-rad*1.008,cy-rad*1.008,rad*2.016,rad*2.016);
  function paintSun(){
  const sun=l.sun,g=ctx.createRadialGradient(sun.x,sun.y,sun.r*.6,sun.x,sun.y,sun.r*4.5);
  g.addColorStop(0,'rgba(255,214,144,.25)');g.addColorStop(.28,'rgba(255,195,91,.085)');g.addColorStop(1,'rgba(255,186,89,0)');
  ctx.fillStyle=g;ctx.fillRect(sun.x-sun.r*4.5,sun.y-sun.r*4.5,sun.r*9,sun.r*9);
  const disc=ctx.createRadialGradient(sun.x,sun.y,0,sun.x,sun.y,sun.r);disc.addColorStop(0,'#fff9e1');disc.addColorStop(.78,'#fff2cc');disc.addColorStop(1,'#ffd59e');
  ctx.fillStyle=disc;ctx.beginPath();ctx.arc(sun.x,sun.y,sun.r,0,2*PI);ctx.fill();
  }
  function paintEarth(){
  const e=l.earth,en=Math.max(30,Math.round(e.r*2*dpr)),ec=earthCanvas;ec.width=ec.height=en;const ectx=ec.getContext('2d'),pix=ectx.createImageData(en,en),er=en/2,M=ef.toGeo,L=ef.light;
  for(let j=0;j<en;j++)for(let i=0;i<en;i++){
   const x=(i+.5-er)/er,y=(er-j-.5)/er,r=x*x+y*y;if(r>=1)continue;const z=Math.sqrt(1-r);
   const a=M[0]*x+M[3]*y+M[6]*z,b=M[1]*x+M[4]*y+M[7]*z,c=M[2]*x+M[5]*y+M[8]*z;
   const idx=ix(et,llU(a,b),llV(c)),light=.09+1.08*Math.pow(Math.max(0,x*L[0]+y*L[1]+z*L[2]),.55);
   const o=(j*en+i)*4;for(let k=0;k<3;k++)pix.data[o+k]=et.rgba[idx+k]*light;pix.data[o+3]=clamp((1-Math.sqrt(r))*er+.5,0,1)*255;
  }
  ectx.putImageData(pix,0,0);ctx.drawImage(ec,e.x-e.r,e.y-e.r,e.r*2,e.r*2);
  }
 }
 const earthCanvas=document.createElement('canvas');
 return {kind:'software',maps,draw,dispose(){cache.clear();canvas.width=canvas.height=off.width=off.height=earthCanvas.width=earthCanvas.height=1;image=undefined;}};
}

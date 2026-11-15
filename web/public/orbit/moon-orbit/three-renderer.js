import {MOON_VERT,MOON_FRAG,BODY_VERT,EARTH_FRAG,SUN_FRAG} from './shaders.js';
import {skyBasis} from './math.js';
export function makeThree(T,canvas,opts={}){
 const render=new T.WebGLRenderer({canvas,context:opts.gl,alpha:true,antialias:true,powerPreference:'low-power',depth:true,stencil:false});
 render.autoClear=false;
 if(!render.capabilities.maxVertexTextures){render.dispose();throw new Error('Vertex textures unavailable');}
 render.setClearColor(0x060a0d,0);render.setPixelRatio(1);
 const scene=new T.Scene(),cam=new T.OrthographicCamera(-2,2,1,-1,.1,20);
 const sky=new T.Scene(),skyCam=new T.PerspectiveCamera(45,1,.1,200);
 const uniform={uHeight:{value:null},uNorth:{value:null},uSouth:{value:null},uAlbedo:{value:null},uCaps:{value:0},uFine:{value:0},uMoving:{value:0},uSun:{value:new T.Vector3()},uEye:{value:new T.Vector3()}};
 const moonMat=new T.ShaderMaterial({uniforms:uniform,vertexShader:MOON_VERT,fragmentShader:MOON_FRAG});
 const moon=new T.Mesh(new T.SphereGeometry(1,352,208).rotateX(Math.PI/2),moonMat);
 // Z is lunar north even though Three's default scene is Y-up.
 moon.frustumCulled=false;scene.add(moon);
 const EU={uMap:{value:null},uGeo:{value:new T.Matrix3()},uLocalSun:{value:new T.Vector3()}};
 const earth=new T.Mesh(new T.SphereGeometry(1,64,40),new T.ShaderMaterial({uniforms:EU,vertexShader:BODY_VERT,fragmentShader:EARTH_FRAG}));
 const sun=new T.Mesh(new T.SphereGeometry(1,48,32),new T.ShaderMaterial({vertexShader:BODY_VERT,fragmentShader:SUN_FRAG}));
 const glow=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=.24*exp(-r*5.)*(1.-smoothstep(.74,1.,r));gl_FragColor=vec4(1.,.74,.38,a);}'
 }));
 glow.renderOrder=-1;sky.add(earth,sun,glow);
 const textures=new Map();let disposed=false,shaderError='';
 render.debug.onShaderError=(gl,program,vs,fs)=>{shaderError=(gl.getProgramInfoLog(program)||'')+' '+(gl.getShaderInfoLog(vs)||'')+' '+(gl.getShaderInfoLog(fs)||'');};
 function texture(im,data,wrap=true){
  if(textures.has(im))return textures.get(im);
  const tex=new T.Texture(im);
  tex.flipY=false;tex.colorSpace=T.NoColorSpace;tex.wrapS=wrap?T.RepeatWrapping:T.ClampToEdgeWrapping;tex.wrapT=T.ClampToEdgeWrapping;
  tex.magFilter=T.LinearFilter;tex.minFilter=data?T.LinearFilter:T.LinearMipmapLinearFilter;
  tex.generateMipmaps=!data;tex.unpackAlignment=1;
  if(!data)tex.anisotropy=Math.min(4,render.capabilities.getMaxAnisotropy());
  tex.needsUpdate=true;textures.set(im,tex);return tex;
 }
 function maps(a){
  const al=texture(a.albedo,false);const he=texture(a.height,true);
  uniform.uAlbedo.value=al;uniform.uHeight.value=he;uniform.uFine.value=a.fine?1:0;
  uniform.uNorth.value=a.north?texture(a.north,true,false):he;uniform.uSouth.value=a.south?texture(a.south,true,false):he;
  uniform.uCaps.value=(a.north&&a.south)?1:0;EU.uMap.value=texture(a.earth,false);
  for(const [img,te] of textures){if(![a.albedo,a.height,a.north,a.south,a.earth].includes(img)){te.dispose();textures.delete(img);}}
 }
 const mat=new T.Matrix4(),vx=new T.Vector3(),vy=new T.Vector3(),vz=new T.Vector3();
 function draw(m,dirs,layout,ef,moving){
  if(disposed)return;const {w,h,cx,cy,rad}=layout;
  const dpr=Math.min(moving?1.05:1.65,window.devicePixelRatio||1,2050/Math.max(w,h));
  const bw=Math.max(2,Math.round(w*dpr)),bh=Math.max(2,Math.round(h*dpr));if(canvas.width!==bw||canvas.height!==bh) render.setSize(bw,bh,false);
  cam.left=-cx/rad;cam.right=(w-cx)/rad;cam.top=cy/rad;cam.bottom=-(h-cy)/rad;cam.updateProjectionMatrix();
  vx.fromArray(m,0);vy.fromArray(m,3);vz.fromArray(m,6);mat.makeBasis(vx,vy,vz);cam.quaternion.setFromRotationMatrix(mat);cam.position.copy(vz).multiplyScalar(6);cam.updateMatrixWorld(true);
  uniform.uEye.value.copy(vz);uniform.uSun.value.fromArray(dirs.sun);uniform.uMoving.value=moving?1:0;
  EU.uLocalSun.value.fromArray(ef.light);EU.uGeo.value.fromArray(ef.toGeo);
  // Two independent passes. The sky camera rotates at the origin; it never
  // travels around the Moon. The lunar surface always occludes the sky.
  const {focal}=layout,k=skyCam.near/focal;
  skyCam.projectionMatrix.makePerspective(-cx*k,(w-cx)*k,cy*k,-(h-cy)*k,skyCam.near,skyCam.far);
  skyCam.projectionMatrixInverse.copy(skyCam.projectionMatrix).invert();
  skyCam.quaternion.copy(cam.quaternion);skyCam.updateMatrixWorld(true);
  function atInfinity(mesh,dir,basis,b,depth,factor=1){
   mesh.visible=b.draw;if(!b.draw)return;
   mesh.position.fromArray(dir).multiplyScalar(depth);
   mat.makeBasis(vx.fromArray(basis,0),vy.fromArray(basis,3),vz.fromArray(basis,6));mesh.quaternion.setFromRotationMatrix(mat);
   mesh.scale.setScalar(depth*Math.sin(b.angular)*factor);
  }
  const sb=skyBasis(m,dirs.sun);
  atInfinity(earth,dirs.earth,ef.basis,layout.earth,48);
  atInfinity(sun,dirs.sun,sb,layout.sun,96);atInfinity(glow,dirs.sun,sb,layout.sun,96.015,4.5);
  render.clear(true,true,true);
  if(layout.sun.draw||layout.earth.draw){render.render(sky,skyCam);render.clearDepth();}
  render.render(scene,cam);
  if(shaderError)throw new Error('Moon shader unavailable: '+shaderError);
 }
 return {kind:'three-webgl2',maps,draw,dispose(){
   if(disposed)return;disposed=true;for(const x of [moon,earth,sun,glow]){x.geometry.dispose();x.material.dispose();}
   for(const tex of textures.values())tex.dispose();textures.clear();scene.clear();sky.clear();render.dispose();
 }};
}

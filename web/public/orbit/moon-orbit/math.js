// All host data: Moon-centred, mean-Earth axes, east-positive, north = +Z.
export const RADIUS_M=1737400, RAD=Math.PI/180;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(a){
 if(!a||a.length!==3||![a[0],a[1],a[2]].every(Number.isFinite))throw TypeError('A direction must contain three finite numbers');
 const l=Math.hypot(...a);if(l<1e-12)throw RangeError('A direction cannot be zero');return [a[0]/l,a[1]/l,a[2]/l];
}
export const axis=(m,j)=>m.slice(j*3,j*3+3);
export function viewAt(lonDeg,latDeg){
 if(!Number.isFinite(lonDeg)||!Number.isFinite(latDeg)||Math.abs(latDeg)>90)throw RangeError('Expected longitude and latitude in degrees, latitude −90..90');
 const a=lonDeg*RAD,b=latDeg*RAD,c=Math.cos(a),s=Math.sin(a),u=Math.cos(b),v=Math.sin(b);
 return [-s,c,0,-v*c,-v*s,u,u*c,u*s,v];
}
export function mult(a,b){const m=[];for(let j=0;j<3;j++)for(let i=0;i<3;i++)m[3*j+i]=a[i]*b[3*j]+a[i+3]*b[3*j+1]+a[i+6]*b[3*j+2];return m;}
export function rotation(x,y,z,w){
 const l=Math.hypot(x,y,z,w);if(l<1e-10)return [1,0,0,0,1,0,0,0,1];x/=l;y/=l;z/=l;w/=l;
 return [1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y)];
}
export function projectTo(a,m){return [dot(a,axis(m,0)),dot(a,axis(m,1)),dot(a,axis(m,2))];}
export function validateFrame(m){
 if(!m||m.length!==9||!Array.from(m).every(Number.isFinite))throw TypeError('earthFixedToMoon must be a 9-number column-major rotation');
 const [a,b,c]=[0,1,2].map(i=>axis(Array.from(m),i));
 if(Math.max(...[a,b,c].map(v=>Math.abs(Math.hypot(...v)-1)),Math.abs(dot(a,b)),Math.abs(dot(a,c)),Math.abs(dot(b,c)))>.005||dot(cross(a,b),c)<.995) throw RangeError('earthFixedToMoon must be a right-handed rotation');
 return Array.from(m);
}
// A fixed direction-only sky, independent of the Moon camera's translation.
// Local +Z of each sky globe points back toward the observer near the Moon.
export function skyBasis(cam,toward){
 const eye=toward.map(v=>-v);let right=cross(axis(cam,1),eye);
 if(Math.hypot(...right)<1e-5)right=cross(axis(cam,0),eye); // off-camera at this singularity
 right=unit(right);return [...right,...cross(eye,right),...eye];
}
export function earthFrame(cam,earth,sun,fixed){
 const basis=skyBasis(cam,earth);
 return {basis,toGeo:[...projectTo(axis(basis,0),fixed),...projectTo(axis(basis,1),fixed),...projectTo(axis(basis,2),fixed)],light:projectTo(sun,basis)};
}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const OPENING_VIEW={longitude:-156,latitude:1};
export function layout(w,h,cam,sun,earth,zoom=1){
 const cx=w*.5,cy=h*.49,rad=Math.max(8,Math.min(w*.337,(h-74)*.452,720))*zoom;
 // Same focal length in both axes; the Moon's angular radius is 18 degrees.
 const focal=rad/Math.tan(18*RAD);
 function edge(ux,uy,inset=0){
  const mx=Math.min(w*.35,42+inset*75),mt=Math.min(h*.29,46+inset*34),mb=Math.min(h*.29,57+inset*34);
  const t=Math.min(Math.abs(ux)>1e-8?(cx-mx)/Math.abs(ux):Infinity,Math.abs(uy)>1e-8?(uy<0?cy-mt:h-cy-mb)/Math.abs(uy):Infinity);
  return {x:cx+ux*t,y:cy+uy*t};
 }
 const bodies=[sun,earth].map((v,i)=>{
  const [dx,dy,dz]=projectTo(v,cam),forward=-dz,lateral=Math.hypot(dx,dy);
  const ux=lateral>1e-7?dx/lateral:0,uy=lateral>1e-7?-dy/lateral:-1;
  const angular=Math.max((i?.95:.266)*RAD,Math.atan((i?5.2:2.4)/focal));
  // Project an angular direction, not a nearby scene position. Rays behind
  // the camera never project onto its image. No normalization at the centre.
  const denom=Math.max(.001,forward),x=cx+focal*dx/denom,y=cy-focal*dy/denom;
  const r=focal*Math.tan(angular)/denom,clearance=forward>.001?Math.min(x,w-x,y,h-y):-Infinity;
  const p=Math.hypot(x-cx,y-cy);
  const extent=(i?1.12:4.8)*r/Math.max(.1,forward);
  const draw=forward>.001 && clearance>=-extent;
  const rim=draw?smooth(rad-r,rad+r+3,p):0;
  const tag=draw?smooth(r+3,r+22,clearance)*rim:0;
  const outside=1-smooth(-r,r+3,clearance);
  // At the anti-view direction, no unique shortest turn exists. A stable
  // 'behind you' cue crossfades before the directional arrow changes sides.
  const bearing=forward<0?smooth(.065,.23,lateral):1,pin=edge(ux,uy);
  const state=forward<=0||clearance< -r?'offscreen':p+r<rad?'occulted':'visible';
  return {x,y,r,angular,forward,draw,tag,pin,ux,uy,pinAlpha:outside*bearing,backAlpha:outside*(1-bearing),angle:Math.atan2(uy,ux),state};
 });
 const [s,e]=bodies;
 // Only the edge labels receive separate lanes when they share a bearing.
 const samePin=1-smooth(.7,1.8,Math.hypot((s.pin.x-e.pin.x)/65,(s.pin.y-e.pin.y)/26));
 e.pin=edge(e.ux,e.uy,samePin*s.pinAlpha*e.pinAlpha);
 // In a true Earth/Sun conjunction the nearer Earth masks the solar disk.
 // Leave both world directions intact and give the Earth label priority.
 s.tag*=1-(1-smooth(.55,1.2,Math.hypot((s.x-e.x)/52,(s.y+s.r-e.y-e.r)/17)))*e.tag;
 return {w,h,cx,cy,rad,focal,sun:s,earth:e};
}

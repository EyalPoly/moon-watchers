// Body-fixed direction n: +X prime meridian, +Y east, +Z north.
// Heights are linear RG bytes (8 metres/count); B of a cap carries LDAM reflectance.
export const TERRAIN=/* glsl */`
uniform sampler2D uHeight, uNorth, uSouth;
uniform float uCaps, uFine;
const float R=1737400.0;
const float PI=3.141592653589793;
vec2 ll(vec3 n){return vec2(fract(atan(n.y,n.x)/(2.0*PI)+0.5),0.5-asin(clamp(n.z,-1.0,1.0))/PI);}
vec2 capUV(vec3 n){return .5+.5*vec2(n.x,-n.y)/((1.0+abs(n.z))*.1316524976);}
vec3 capSample(vec3 n){vec2 uv=capUV(n);if(n.z>0.)return texture2D(uNorth,uv).rgb;return texture2D(uSouth,uv).rgb;}
float capMix(vec3 n){return uCaps*smoothstep(.9702957263,.9848077530,abs(n.z));}
float decodeH(vec2 rg){return dot(rg,vec2(65280.,255.))*8.-12000.;}
float heightM(vec3 n){
 float f=capMix(n);
 if(f>.999)return decodeH(capSample(n).rg);
 float h=decodeH(texture2D(uHeight,ll(n)).rg);
 if(f>.001)h=mix(h,decodeH(capSample(n).rg),f);
 return h;
}
`;
export const MOON_VERT=TERRAIN+/* glsl */`
varying vec3 vBody;
void main(){
 vec3 n=normalize(position);vBody=n;
 // Physical topography also changes the mesh silhouette, not just its shading.
 vec3 p=n*(1.+heightM(n)/R);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}
`;
export const MOON_FRAG=TERRAIN+/* glsl */`
uniform sampler2D uAlbedo;
uniform vec3 uSun,uEye;
uniform float uMoving;
varying vec3 vBody;
float visibility(vec3 p,float h,float mu){
 if(mu>.45)return 1.;
 if(mu<-.145)return 0.;
 float nearStep=mix(mix(3800.,1650.,uFine),970.,capMix(p));
 float d=nearStep;
 float worst=-1.;
 vec3 origin=p*(1.+(h+9.)/R);
 // Trace towards the Sun against the sampled DEM. A 0.27-degree solar radius
 // softens the horizon. Curvature is included rather than using a planar ramp.
 for(int j=0;j<15;j++){
   vec3 ray=origin+uSun*(d/R);
   float rr=length(ray);
   float delta=(heightM(ray/rr)-(rr-1.)*R)/d;
   worst=max(worst,delta);
   d*=1.44;
 }
 return 1.-smoothstep(-.00465,.00465,worst);
}
void main(){
 vec3 p=normalize(vBody);float f=capMix(p),h=heightM(p);
 vec3 ref=texture2D(uAlbedo,ll(p)).rgb;
 if(f>.001)ref=mix(ref,vec3(capSample(p).b),f);
 vec3 east=vec3(-p.y,p.x,0.);east=length(east)>.0001?normalize(east):vec3(0.,1.,0.);
 vec3 north=cross(p,east);
 float eps=mix(mix(.006,.0017,uFine),.00068,f);
 float de=(heightM(normalize(p+eps*east))-heightM(normalize(p-eps*east)))/(2.*eps*R);
 float dn=(heightM(normalize(p+eps*north))-heightM(normalize(p-eps*north)))/(2.*eps*R);
 vec3 norm=normalize(p-1.17*(de*east+dn*north));
 float mu=dot(p,uSun),nd=max(0.,dot(norm,uSun)),nv=max(.115,dot(norm,uEye));
 float sh=nd>.0002?visibility(p,h,mu):0.;
 float direct=sh*(.54*(2.*nd/(nd+nv+.0001))+.46*nd);
 vec3 a=max(vec3(.025),(ref-.5)*1.18+.51);
 vec3 col=1.11*a*(.049+pow(max(direct,0.),.67));
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}
`;
export const BODY_VERT=/* glsl */`
varying vec3 vN;
void main(){vN=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
export const EARTH_FRAG=/* glsl */`
uniform sampler2D uMap;uniform mat3 uGeo;uniform vec3 uLocalSun;
varying vec3 vN;
void main(){
 vec3 n=normalize(vN),g=uGeo*n;
 vec2 uv=vec2(fract(atan(g.y,g.x)/6.283185307+.5),.5-asin(clamp(g.z,-1.,1.))/3.141592654);
 vec3 a=texture2D(uMap,uv).rgb;
 float raw=dot(n,uLocalSun),lit=max(raw,0.);
 float rim=pow(1.-max(0.,n.z),3.);
 vec3 col=a*(.09+1.08*pow(lit,.55)) + vec3(.07,.17,.28)*rim*(.08+smoothstep(-.1,.13,raw));
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}
`;
export const SUN_FRAG=/* glsl */`
varying vec3 vN;
void main(){vec3 n=normalize(vN);float edge=pow(1.-max(0.,n.z),.95);
 gl_FragColor=vec4(mix(vec3(1.,.978,.88),vec3(1.,.79,.49),edge*.85),1.);}
`;

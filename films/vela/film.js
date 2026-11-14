// VELA — launch film. Every frame is a pure function of time: renderAt(t).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W = 1920, H = 1080;
export const DURATION = 35;

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const prog = (a, b, x) => clamp((x - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const outExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const outCubic = t => 1 - Math.pow(1 - t, 3);
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inOutQuint = t => (t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, t) => a.clone().lerp(b, t);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 200);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 8 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
    if(!(c.r==c.r)||!(c.g==c.g)||!(c.b==c.b))c=vec3(0.);gl_FragColor=vec4(clamp(c,0.,40.),1.);}` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.14, 0.55, 2.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, t: { value: 0 }, black: { value: 0 }, white: { value: 0 }, vig: { value: .28 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float t,black,white,vig;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+t*61.7)*43758.5453);}
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
      vec2 q=vUv-.5;c*=1.-vig*smoothstep(.25,.85,length(q)*1.25);
      c=mix(c,vec3(1.),white);c*=1.-black;
      c+=(h(vUv*1000.)-.5)*.010;
      gl_FragColor=vec4(c,1.);}`,
});
composer.addPass(grade);

// ---------- environments (studio lighting reflected by metal) ----------
const pmrem = new THREE.PMREMGenerator(renderer);
function makeEnv(boxes, blur = 0.015) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x000000);
  for (const b of boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...b.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color ?? 0xffffff).multiplyScalar(b.i), side: THREE.DoubleSide }));
    m.position.set(...b.pos); s.add(m);
  }
  return pmrem.fromScene(s, blur, 0.1, 100).texture;
}
const ENV = {
  studio: makeEnv([
    { size: [14, .2, 9], pos: [0, 10, 0], i: 2.6 },
    { size: [.2, 16, 1.8], pos: [-11, 0, 3], i: 9 },
    { size: [.2, 16, 1.2], pos: [11, 0, 1], i: 12 },
    { size: [1.3, 12, .2], pos: [5, 1, -11], i: 7, color: 0xffe9d6 },
    { size: [14, .2, 1.4], pos: [0, -9, 5], i: 2.4, color: 0xdfe8ff },
    { size: [7, 7, .2], pos: [-3, 4, 12], i: 1.3 },
  ], .03),
  strip: makeEnv([
    { size: [.15, 20, 1.1], pos: [10, 0, 0], i: 22 },
    { size: [20, .2, 20], pos: [0, 12, 0], i: .22 },
  ], .005),
  room: makeEnv([
    { size: [10, .2, 10], pos: [0, 10, 0], i: 1.0 },
    { size: [.2, 10, 1.2], pos: [-10, 2, 4], i: 8 },
    { size: [.2, 10, .8], pos: [10, 2, 6], i: 6 },
  ], .03),
};

// ---------- procedural textures ----------
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const blastRough = canvasTex(1024, 256, (g, w, h) => {
  const d = g.createImageData(w, h);
  for (let i = 0; i < d.data.length; i += 4) { const v = 150 + rnd() * 105; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
}, { linear: true, repeat: [48, 10] });

// ---------- lathe helpers ----------
const P = (x, y) => new THREE.Vector2(Math.max(x, 0), y);
function arc(pts, cx, cy, r, a0, a1, n = 8) {
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
}
function ringProfile(ri, ro, h, r) {
  const y = h / 2, pts = [], PI = Math.PI;
  arc(pts, ri + r, -y + r, r, PI, PI * 1.5);          // inner-bottom
  arc(pts, ro - r, -y + r, r, PI * 1.5, PI * 2);      // outer-bottom
  arc(pts, ro - r, y - r, r, 0, PI * .5);             // outer-top
  arc(pts, ri + r, y - r, r, PI * .5, PI);            // inner-top
  pts.push(pts[0].clone());
  return pts;
}
const lathe = (pts, mat, seg = 256) => new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);

// ---------- device ----------
export const FINISH = {
  natural: { color: 0xc9c2b6, label: 'Natural' },
  graphite: { color: 0x47484d, label: 'Graphite' },
  ember: { color: 0xc4603a, label: 'Ember' },
};
const textCanvas = (txt, px, weight = 600, tracking = '-0.04em', color = '#fff') => canvasTex(2048, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.font = `${weight} ${px}px "Inter Tight"`; g.letterSpacing = tracking; g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2);
});

function boardTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#0b0d12'; g.fillRect(0, 0, w, h);
    g.lineWidth = 2; g.strokeStyle = 'rgba(214,170,95,.75)';
    for (let i = 0; i < 90; i++) {
      let a = rnd() * 6.283, r = 170 + rnd() * 310;
      g.beginPath(); g.moveTo(512 + Math.cos(a) * r, 512 + Math.sin(a) * r);
      const a2 = a + (rnd() - .5) * .7; const r2 = r - 40 - rnd() * 160;
      g.lineTo(512 + Math.cos(a) * r2, 512 + Math.sin(a) * r2);
      g.lineTo(512 + Math.cos(a2) * r2 * .8, 512 + Math.sin(a2) * r2 * .8); g.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const a = rnd() * 6.283, r = 210 + rnd() * 260, s = 14 + rnd() * 44;
      g.fillStyle = rnd() > .5 ? '#1b1e26' : '#2a2d35';
      g.fillRect(512 + Math.cos(a) * r - s / 2, 512 + Math.sin(a) * r - s / 2, s, s * .7);
    }
    g.fillStyle = '#23252c'; g.fillRect(372, 372, 280, 280);
    g.strokeStyle = '#6b6e78'; g.lineWidth = 3; g.strokeRect(372, 372, 280, 280);
    g.fillStyle = '#f2f2f4'; g.font = '600 112px "Inter Tight"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('V1', 512, 512);
  });
}
function batteryTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#26272c'); gr.addColorStop(.5, '#3b3c42'); gr.addColorStop(1, '#232428');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e6e6ea'; g.textAlign = 'center'; g.font = '600 62px "Inter Tight"'; g.fillText('Vela', 512, 490);
    g.font = '400 34px "Inter"'; g.fillStyle = '#a3a3a8'; g.fillText('5,200 mAh  ·  Li-ion', 512, 556);
  });
}

function makeDevice(finishKey = 'natural') {
  const group = new THREE.Group(); group.rotation.order = 'YXZ';
  const f = FINISH[finishKey];
  const titanium = new THREE.MeshPhysicalMaterial({ color: f.color, metalness: 1, roughness: .34, roughnessMap: blastRough });
  const polished = new THREE.MeshPhysicalMaterial({ color: f.color, metalness: 1, roughness: .1 });
  const blackAno = new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: .85, roughness: .32 });
  const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x09090c, metalness: 0, roughness: .24, clearcoat: 1, clearcoatRoughness: .08, specularIntensity: .7 });
  const led = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffe2bf), emissiveIntensity: 0 });
  const core = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xfff2dc), emissiveIntensity: 0 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x141a55, metalness: 1, roughness: .14, iridescence: .55, iridescenceIOR: 1.5, iridescenceThicknessRange: [380, 460], clearcoat: 1 });
  const coating = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: .02, iridescence: .8, iridescenceIOR: 1.6, iridescenceThicknessRange: [350, 430], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, specularIntensity: 1 });

  const H_ = .2, R = .845;

  // Outer ring (gimbal)
  const ring = new THREE.Group(); group.add(ring);
  ring.add(lathe(ringProfile(.862, 1, .22, .018), titanium));
  ring.add(lathe(ringProfile(.862, .872, .226, .004), polished)); // polished inner lip
  for (const s of [-1, 1]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .05, 24), polished);
    pin.rotation.z = Math.PI / 2; pin.position.x = s * .857; ring.add(pin);
  }

  // Inner puck rotates on the pins
  const pivot = new THREE.Group(); group.add(pivot);

  // Shell (cup)
  const shell = (() => {
    const y = H_ / 2, r = .022, pts = [P(0, -y)], PI = Math.PI;
    arc(pts, R - r, -y + r, r, PI * 1.5, PI * 2);
    arc(pts, R - .006, y - .006, .006, 0, PI * .5);
    pts.push(P(R - .02, y)); pts.push(P(R - .02, -y + .03)); pts.push(P(0, -y + .03));
    return lathe(pts, titanium);
  })();
  const stamp = new THREE.Mesh(new THREE.PlaneGeometry(.9, .225), new THREE.MeshPhysicalMaterial({
    color: 0x2a2a2c, metalness: 1, roughness: .16, transparent: true, map: textCanvas('vela', 300), depthWrite: false,
  }));
  stamp.rotation.x = Math.PI / 2; stamp.position.y = -H_ / 2 - .001; shell.add(stamp);
  pivot.add(shell);

  // Front glass (annulus)
  const glass = lathe(ringProfile(.405, R - .021, .014, .006), blackGlass);
  glass.position.y = H_ / 2 - .004; pivot.add(glass);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(.445, .0055, 12, 256), led);
  ledRing.rotation.x = Math.PI / 2; ledRing.position.y = .0045; glass.add(ledRing);

  // Lens assembly
  const lens = new THREE.Group(); lens.position.y = H_ / 2; pivot.add(lens);
  lens.add(lathe(ringProfile(.362, .406, .022, .006), polished));
  const cone = (() => {
    const pts = []; let r = .365, y = .004;
    for (let i = 0; i < 13; i++) { pts.push(P(r, y)); r -= .009; pts.push(P(r, y)); pts.push(P(r, y - .001)); y -= .0105; pts.push(P(r, y)); }
    pts.push(P(.0, y));
    return lathe(pts, blackAno);
  })();
  lens.add(cone);
  const bead = (() => { // polished inner rim
    const m = lathe(ringProfile(.222, .246, .012, .004), polished); m.position.y = -.112; return m;
  })(); lens.add(bead);
  const deep = (() => { // iridescent inner element
    const pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI / 2; pts.push(P(Math.cos(a) * .222, -.128 + Math.sin(a) * .05)); }
    return lathe(pts.reverse().reverse(), iris);
  })(); lens.add(deep);
  const coreMesh = new THREE.Mesh(new THREE.CircleGeometry(.075, 64), core);
  coreMesh.rotation.x = -Math.PI / 2; coreMesh.position.y = -.075; lens.add(coreMesh);
  const dome = (() => {
    const pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28; pts.push(P((1 - a) * .362, .006 + Math.sqrt(1 - a * a * .0) * 0 + (1 - (1 - a) ** 2) * .03)); }
    // order: outer→centre so the normals face up
    return lathe(pts, coating);
  })(); lens.add(dome);

  // Internals — only shown when exploded
  const inner = new THREE.Group(); pivot.add(inner); inner.visible = false;
  const engine = new THREE.Group(); inner.add(engine);
  engine.add(lathe(ringProfile(.001, .36, .035, .01), new THREE.MeshPhysicalMaterial({ color: 0x8b8d94, metalness: 1, roughness: .3 })));
  for (let i = 0; i < 28; i++) { // heat fins
    const a = i / 28 * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.11, .05, .006), new THREE.MeshPhysicalMaterial({ color: 0x9a9ca3, metalness: 1, roughness: .25 }));
    fin.position.set(Math.cos(a) * .29, .035, Math.sin(a) * .29); fin.rotation.y = -a; engine.add(fin);
  }
  const lasers = [0xff2d4a, 0x24ff7a, 0x2c6bff].map((c, i) => {
    const a = i / 3 * Math.PI * 2 + .5;
    const m = new THREE.MeshStandardMaterial({ color: 0, emissive: new THREE.Color(c), emissiveIntensity: 3.2 });
    const l = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .1, 32), m);
    l.position.set(Math.cos(a) * .11, .06, Math.sin(a) * .11); engine.add(l); return l;
  });
  const board = new THREE.Mesh(new THREE.CylinderGeometry(.79, .79, .016, 128), [
    new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: .6, metalness: .2 }),
    new THREE.MeshPhysicalMaterial({ map: boardTexture(), roughness: .42, metalness: .35 }),
    new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: .6 }),
  ]); inner.add(board);
  const battery = new THREE.Mesh(new THREE.CylinderGeometry(.77, .77, .07, 128), [
    new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, metalness: .9, roughness: .34 }),
    new THREE.MeshPhysicalMaterial({ map: batteryTexture(), metalness: .85, roughness: .36 }),
    new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, metalness: .9, roughness: .34 }),
  ]); inner.add(battery);

  const parts = { glass, lens, engine, board, battery, shell, ring };
  const base = {}; for (const k in parts) base[k] = parts[k].position.clone();
  base.engine.y = -.02; base.board.y = -.03; base.battery.y = -.06;
  const OFFS = { glass: 2.75, lens: 1.85, engine: .95, board: .05, battery: -.85, shell: -1.75, ring: -2.75 };
  const STAG = { glass: 0, lens: .06, engine: .12, board: .18, battery: .24, shell: .3, ring: .36 };

  return {
    group, pivot, ring, parts, glassMat: blackGlass,
    setOpen(a) { pivot.rotation.x = a; },
    setLight(v) { led.emissiveIntensity = v * 7; core.emissiveIntensity = v * 26; },
    setExplode(v) {
      inner.visible = v > 0.001;
      for (const k in parts) {
        const e = inOutQuint(clamp((v - STAG[k] * .5) / (1 - .18)));
        parts[k].position.y = base[k].y + OFFS[k] * e;
      }
    },
  };
}
await document.fonts.load('600 300px "Inter Tight"'); await document.fonts.load('400 34px "Inter"');
seed = 7;

const dev = makeDevice('natural'); scene.add(dev.group);
const devG = makeDevice('graphite'); scene.add(devG.group);
const devE = makeDevice('ember'); scene.add(devE.group);

// ---------- beam ----------
const beamGeo = new THREE.CylinderGeometry(1, 0, 1, 96, 32, true); beamGeo.translate(0, .5, 0);
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { color: { value: new THREE.Color(1, .9, .78) }, power: { value: 0 } },
  vertexShader: `varying vec3 vN,vV;varying float vY;void main(){vY=position.y;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform vec3 color;uniform float power;varying vec3 vN,vV;varying float vY;
    void main(){float f=pow(abs(dot(normalize(vN),normalize(vV))),2.2);
      float a=power*f*mix(1.,.12,pow(max(vY,.0001),.55))*smoothstep(0.,.015,vY)*(1.-smoothstep(.5,.98,vY));
      gl_FragColor=vec4(color*a,1.);}`,
});
const beam = new THREE.Mesh(beamGeo, beamMat); beam.frustumCulled = false; scene.add(beam);
const dustGeo = new THREE.BufferGeometry();
{ const n = 900, a = new Float32Array(n * 3), p = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) a[i] = rnd();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(a, 3)); }
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { t: { value: 0 }, power: { value: 0 }, color: { value: new THREE.Color(1, .9, .78) } },
  vertexShader: `attribute vec3 seed;uniform float t;varying float vA;void main(){
    float y=fract(seed.y+t*.012+seed.x*.2);float r=sqrt(seed.x)*y*.92;float a=seed.z*6.283+t*.09;
    vec3 p=vec3(cos(a)*r,y,sin(a)*r);vec4 mv=modelViewMatrix*vec4(p,1.);
    vA=smoothstep(0.,.1,y)*(1.-smoothstep(.8,1.,y))*(.35+.65*fract(seed.z*17.+t*.2));
    gl_PointSize=min((.9+seed.x*1.5)*11./max(-mv.z,.4),5.5);gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform float power;uniform vec3 color;varying float vA;void main(){float d=length(gl_PointCoord-.5);float s=smoothstep(.5,.1,d);gl_FragColor=vec4(color*s*vA*power,1.);}`,
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; beam.add(dust);
const UP = V(0, 1, 0);
function aimBeam(apex, target, rx, ry, power, color, spin = 0) {
  beam.visible = power > .001;
  const d = target.clone().sub(apex), len = d.length();
  beam.position.copy(apex); beam.quaternion.setFromUnitVectors(UP, d.normalize());
  beam.rotateY(spin); beam.scale.set(rx, len, ry);
  beamMat.uniforms.power.value = power; dustMat.uniforms.power.value = power * 3.;
  if (color) { beamMat.uniforms.color.value.copy(color); dustMat.uniforms.color.value.copy(color); }
}
const lensWorld = (d) => d.pivot.localToWorld(V(0, .13, 0));

// ---------- projected content (shaders & canvas) ----------
const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<6;i++){v+=a*vn(p);p=p*2.03+vec2(11.,7.);a*=.5;}return v;}`;
const planeVS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const duneMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, power: { value: 0 } }, vertexShader: planeVS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  fragmentShader: NOISE + `uniform float t,power;varying vec2 vUv;
  float ridge(float x,float s,float o){return fbm(vec2(x*s+o,o*.3))*.9;}
  void main(){vec2 uv=vUv;float asp=1.778;vec2 p=vec2((uv.x-.5)*asp,uv.y);
    vec3 top=vec3(.035,.065,.26),mid=vec3(.95,.26,.22),low=vec3(1.5,.74,.28);
    float y=uv.y;vec3 c=mix(low,mid,smoothstep(.34,.62,y));c=mix(c,top,smoothstep(.56,1.,y));
    vec2 sp=vec2(.12+.015*t,.40);float d=length(p-vec2(sp.x,sp.y));
    c+=vec3(2.6,1.5,.7)*exp(-d*7.5)*.8;c+=vec3(4.2,3.1,2.0)*smoothstep(.078,.07,d);
    float cl=fbm(vec2(p.x*2.2+t*.035,y*10.));c+=vec3(1.1,.42,.36)*smoothstep(.52,.78,cl)*smoothstep(.42,.6,y)*(1.-smoothstep(.76,.96,y))*.75;
    float s=fract(sin(dot(floor(uv*340.),vec2(12.3,78.1)))*4375.);c+=vec3(.9)*step(.996,s)*smoothstep(.75,1.,y);
    vec3 sc1=vec3(.60,.20,.20),sc2=vec3(.27,.08,.13),sc3=vec3(.09,.025,.06),sc4=vec3(.018,.006,.018);
    float h1=.26+.22*ridge(p.x+t*.008,1.5,1.);c=mix(c,sc1,smoothstep(h1+.002,h1-.002,y));
    float h2=.13+.3*ridge(p.x+t*.016,1.15,5.);c=mix(c,sc2+.09*vec3(1.,.4,.25)*smoothstep(h2-.05,h2,y),smoothstep(h2+.002,h2-.002,y));
    float h3=.05+.28*ridge(p.x+t*.03,.95,9.);c=mix(c,sc3,smoothstep(h3+.002,h3-.002,y));
    float h4=-.02+.2*ridge(p.x+t*.05,.75,14.);c=mix(c,sc4,smoothstep(h4+.002,h4-.002,y));
    vec2 e=smoothstep(vec2(0.),vec2(.006),uv)*smoothstep(vec2(0.),vec2(.006),1.-uv);
    gl_FragColor=vec4(c*power*e.x*e.y,1.);}`,
});
const starMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, power: { value: 0 } }, vertexShader: planeVS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  fragmentShader: NOISE + `uniform float t,power;varying vec2 vUv;
  float stars(vec2 p,float dens,float tw){vec2 g=floor(p),f=fract(p)-.5;float h=hash(g);if(h<1.-dens)return 0.;
    vec2 o=vec2(hash(g+3.1),hash(g+7.7))-.5;float d=length(f-o*.7);float b=pow(hash(g+1.7),4.)*1.1+.28;
    return b*smoothstep(.16,.0,d)*(.7+.3*sin(t*tw+h*40.));}
  void main(){vec2 q=vUv-.5;float a=t*.016;mat2 R=mat2(cos(a),-sin(a),sin(a),cos(a));vec2 p=R*q;
    float band=exp(-pow((p.y+p.x*.55)*4.2,2.));float neb=fbm(p*5.+vec2(2.,1.));float neb2=fbm(p*12.+3.);
    vec3 c=vec3(.006,.009,.03)+band*(vec3(.075,.1,.24)*neb*1.25+vec3(.34,.16,.25)*smoothstep(.52,.82,neb2)*.32);
    c-=band*smoothstep(.45,.62,fbm(p*9.+8.))*.11;c=max(c,0.);
    float s=stars(p*170.,.3,3.)+stars(p*330.,.34,5.)*.65+stars(p*80.,.09,2.)*1.5+stars(p*620.,.5,7.)*.3*(1.+band*2.);
    c+=s*mix(vec3(1.,.93,.84),vec3(.76,.86,1.),hash(floor(p*70.)))*1.5;
    float m=clamp((t-1.1)/.5,0.,1.);if(m>0.&&m<1.){vec2 a0=vec2(-.28,.20),a1=vec2(.14,.02);vec2 h=mix(a0,a1,m);vec2 dv=normalize(a1-a0);vec2 r=q-h;float al=dot(r,-dv);float pe=length(r+dv*al);
      c+=vec3(1.5,1.6,2.)*smoothstep(.003,.0,pe)*smoothstep(.17,0.,al)*step(0.,al)*sin(m*3.14);}
    float e=1.-smoothstep(.2,.5,length(q));gl_FragColor=vec4(c*power*e,1.);}`,
});
const haloMat = (col) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(col) }, power: { value: 0 } }, vertexShader: planeVS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  fragmentShader: `uniform vec3 color;uniform float power;varying vec2 vUv;void main(){vec2 q=(vUv-.5)*2.;float d=length(q);float a=pow(max(1.-d,0.),2.2);gl_FragColor=vec4(color*a*power,1.);}`,
});

// Studio-app UI projected on the table.
const uiCv = document.createElement('canvas'); uiCv.width = 1600; uiCv.height = 1000;
const uiCtx = uiCv.getContext('2d');
const uiTex = new THREE.CanvasTexture(uiCv); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 16;
const TRACKS = [
  { n: 'Lead', c: ['#ff9a62', '#ff4f7b'], clips: [[.03, .28], [.34, .3], [.68, .3]], s: 3 },
  { n: 'Keys', c: ['#ffd08a', '#ff9a4f'], clips: [[.03, .48], [.54, .44]], s: 9 },
  { n: 'Bass', c: ['#b08cff', '#6a5cff'], clips: [[.12, .36], [.5, .48]], s: 17 },
  { n: 'Drums', c: ['#62d9ff', '#3f8cff'], clips: [[.03, .95]], s: 23 },
  { n: 'Choir', c: ['#6ff0b8', '#2cc8a0'], clips: [[.26, .34], [.7, .28]], s: 31 },
];
const wave = (i, s) => { const a = Math.sin(i * .19 + s) * .5 + .5, b = Math.sin(i * .051 + s * 2) * .5 + .5, c = Math.abs(Math.sin(i * .71 + s * 3)); return clamp(.14 + .86 * a * b * (.4 + .6 * c)); };
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function drawUI(t) {
  const g = uiCtx, Wd = 1600, Hd = 1000; g.fillStyle = '#000'; g.fillRect(0, 0, Wd, Hd);
  rr(g, 8, 8, Wd - 16, Hd - 16, 44); g.fillStyle = '#17171d'; g.fill();
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#f5f5f7'; g.font = '600 50px "Inter Tight"'; g.fillText('Golden Hour', 64, 84);
  g.fillStyle = '#8e8e96'; g.font = '500 30px "Inter"'; g.fillText('104 BPM  ·  D minor', 64, 132);
  // transport
  const pp = (.14 + t * .058); const sec = Math.floor(pp * 180);
  g.fillStyle = '#f5f5f7'; g.textAlign = 'right'; g.font = '600 66px "Inter Tight"'; g.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, Wd - 64, 100); g.textAlign = 'left';
  const L = 270, R = Wd - 56, Tw = R - L, top = 196, tH = 138, gap = votes();
  function votes() { return 16; }
  TRACKS.forEach((tr, k) => {
    const y = top + k * (tH + gap);
    g.fillStyle = '#d6d6dc'; g.font = '600 32px "Inter Tight"'; g.fillText(tr.n, 64, y + tH / 2 - 12);
    const lvl = wave(Math.floor(t * 16) + k * 30, tr.s); rr(g, 64, y + tH / 2 + 18, 170, 8, 4); g.fillStyle = '#2e2e36'; g.fill();
    rr(g, 64, y + tH / 2 + 18, 170 * (.2 + .8 * lvl), 8, 4); g.fillStyle = tr.c[0]; g.fill();
    for (const [a, b] of tr.clips) {
      const x = L + a * Tw, w = b * Tw;
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, tr.c[0]); gr.addColorStop(1, tr.c[1]);
      rr(g, x, y, w, tH, 18); g.globalAlpha = .24; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
      g.fillStyle = gr; const n = Math.floor(w / 9);
      for (let i = 0; i < n; i++) { const h = wave(i + a * 900, tr.s) * tH * .78; rr(g, x + 8 + i * 9, y + tH / 2 - h / 2, 5, h, 2.5); g.fill(); }
    }
  });
  const px = L + pp * Tw; g.fillStyle = '#fff'; g.fillRect(px - 2, top - 16, 4, Hd - top - 14); g.beginPath(); g.arc(px, top - 18, 11, 0, 7); g.fill();
  uiTex.needsUpdate = true;
}

// ---------- rooms ----------
const wallRoom = new THREE.Group(); scene.add(wallRoom);
const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: .62, metalness: 0, transparent: true, opacity: .93 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat); floor.rotation.x = -Math.PI / 2; wallRoom.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: .92 })); wall.position.set(0, 8, -6); wallRoom.add(wall);
const PIC_W = 7.4, PIC_H = PIC_W * 9 / 16, PIC_Y = 2.72;
const pic = new THREE.Mesh(new THREE.PlaneGeometry(PIC_W, PIC_H), duneMat); pic.position.set(0, PIC_Y, -5.98); wallRoom.add(pic);
const picRefl = new THREE.Mesh(new THREE.PlaneGeometry(PIC_W, PIC_H), duneMat); picRefl.scale.y = -1; picRefl.material = duneMat.clone(); picRefl.material.side = THREE.DoubleSide; picRefl.position.set(0, -PIC_Y, -5.98); wallRoom.add(picRefl);
const wallHalo = new THREE.Mesh(new THREE.PlaneGeometry(PIC_W * 2.2, PIC_H * 2.6), haloMat(0xff7a4a)); wallHalo.position.set(0, PIC_Y, -5.97); wallRoom.add(wallHalo);

const tableRoom = new THREE.Group(); scene.add(tableRoom);
const woodTex = canvasTex(2048, 2048, (g, w, h) => {
  g.fillStyle = '#2a1a11'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2300; i++) {
    const y = rnd() * h, d = rnd(); g.strokeStyle = d > .5 ? `rgba(12,6,3,${.05 + rnd() * .22})` : `rgba(130,84,50,${.02 + rnd() * .10})`;
    g.lineWidth = .6 + rnd() * 3.2; g.beginPath(); g.moveTo(0, y);
    const a = rnd() * 22, f = 1 + rnd() * 2.5, ph = rnd() * 6;
    for (let x = 0; x <= w; x += 60) g.lineTo(x, y + Math.sin(x / w * 6.28 * f + ph) * a);
    g.stroke();
  }
});
const table = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0x9a8f88, roughness: .62, clearcoat: 0 })); table.rotation.x = -Math.PI / 2; tableRoom.add(table);
const UI_W = 4.8, UI_H = 3.0;
const uiPlane = new THREE.Mesh(new THREE.PlaneGeometry(UI_W, UI_H), new THREE.MeshBasicMaterial({ map: uiTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff })); uiPlane.rotation.x = -Math.PI / 2; uiPlane.position.set(0, .004, .9); tableRoom.add(uiPlane);
const tableHalo = new THREE.Mesh(new THREE.PlaneGeometry(UI_W * 2.2, UI_H * 2.5), haloMat(0x9aa0d0)); tableHalo.rotation.x = -Math.PI / 2; tableHalo.position.set(0, .003, .9); tableRoom.add(tableHalo);
// a mug & pencil: human scale, off to the side
const mug = (() => {
  const g = new THREE.Group();
  const y = .46, pts = [P(0, 0), P(.27, 0), P(.3, .03), P(.3, y), P(.285, y + .012), P(.27, y), P(.27, .05), P(0, .05)];
  g.add(lathe(pts, new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, roughness: .3, clearcoat: .6 }), 96));
  const h = new THREE.Mesh(new THREE.TorusGeometry(.1, .024, 16, 48, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, roughness: .3, clearcoat: .6 })); h.position.set(.3, .24, 0); h.rotation.z = -Math.PI / 2; g.add(h);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(.27, 48), new THREE.MeshPhysicalMaterial({ color: 0x1a0e07, roughness: .12 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = .39; g.add(coffee);
  g.position.set(3.75, 0, -.5); g.rotation.y = 2.5; return g;
})(); tableRoom.add(mug);

const ceilRoom = new THREE.Group(); scene.add(ceilRoom);
const sky = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), starMat); sky.rotation.x = Math.PI / 2; sky.position.set(0, 7, -5.5); ceilRoom.add(sky);
const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x14151c, roughness: .95, side: THREE.DoubleSide })); ceilMesh.rotation.x = Math.PI / 2; ceilMesh.position.set(0, 7.005, -5.5); ceilRoom.add(ceilMesh);
const night = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 5), new THREE.MeshPhysicalMaterial({ color: 0x0f0f13, roughness: .42 })); night.position.set(0, -.6, 0); ceilRoom.add(night);
const ceilWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 14), new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: .9 })); ceilWall.position.set(0, 3, -16); ceilRoom.add(ceilWall);

const projLight = new THREE.PointLight(0xffffff, 0, 0, 1.6); scene.add(projLight);

// Wordmark behind the device in the hero.
const wordTex = textCanvas('Vela', 430);
const word = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: wordTex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1) }));
word.position.z = -3; scene.add(word);

// Warm backlight glow used in the hero & finale.
const glow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), haloMat(0xff7a4a)); glow.position.z = -3.2; scene.add(glow);

// ---------- DOM layer ----------
const ui = document.getElementById('ui');
const CAPS = [
  { a: 1.25, b: 4.62, text: 'Every screen has an edge.', cls: 'center' },
  { a: 5.0, b: 6.9, text: 'Until now.', cls: 'lowc', big: true },
  { a: 9.95, b: 11.9, text: 'The first cinema that fits in your palm.', cls: 'lowc' },
  { a: 12.2, b: 14.32, text: 'A wall becomes a cinema.', cls: 'll' },
  { a: 14.6, b: 16.72, text: 'A table becomes a studio.', cls: 'tl' },
  { a: 17.0, b: 19.12, text: 'A ceiling becomes the sky.', cls: 'll' },
  { a: 19.6, b: 23.85, text: 'Engineered to disappear.', cls: 'top' },
  { a: 26.55, b: 28.7, text: 'Three finishes. One obsession.', cls: 'top' },
  { a: 29.05, b: 30.55, text: 'Everywhere is the screen.', cls: 'top', grad: true, y: 170 },
];
for (const c of CAPS) {
  const el = document.createElement('div'); el.className = 'cap ' + c.cls;
  if (c.big) el.style.fontSize = '84px';
  if (c.y) { el.style.top = c.y + 'px'; el.style.fontSize = '104px'; }
  if (c.cls === 'top' && !c.y) { el.style.top = '56px'; el.style.fontSize = '68px'; }
  el.innerHTML = c.text.split(' ').map(w => `<span class="w${c.grad ? ' grad' : ''}">${w}</span>`).join(' ');
  ui.appendChild(el); c.el = el; c.words = [...el.querySelectorAll('.w')];
}
function drawCaps(t) {
  for (const c of CAPS) {
    const on = t >= c.a && t < c.b + .001; c.el.style.display = on ? 'block' : 'none'; if (!on) continue;
    const out = 1 - ss(c.b - .2, c.b, t);
    c.words.forEach((w, i) => {
      const p = outCubic(prog(c.a + i * .055, c.a + i * .055 + .62, t));
      w.style.opacity = p * out;
      w.style.transform = `translateY(${(1 - p) * 26}px)`;
      w.style.filter = p < .999 ? `blur(${(1 - p) * 9}px)` : 'none';
    });
  }
}
// Stats
const statsEl = document.createElement('div'); statsEl.id = 'stats'; ui.appendChild(statsEl);
const STATS = [
  { a: 24, b: 24.8, n: 120, unit: '″', sub: 'of picture, on any surface.', side: 'l' },
  { a: 24.8, b: 25.6, n: 61, unit: ' g', sub: 'Lighter than a deck of cards.', side: 'r' },
  { a: 25.6, b: 26.4, n: 8, unit: ' hr', sub: 'Of battery. A whole trilogy.', side: 'l' },
];
for (const s of STATS) {
  const el = document.createElement('div'); el.className = 'stat';
  el.style[s.side === 'l' ? 'left' : 'right'] = '110px'; if (s.side === 'r') el.style.textAlign = 'right';
  el.innerHTML = `<div class="num grad"><span class="v">0</span><small>${s.unit}</small></div><div class="sub">${s.sub}</div>`;
  statsEl.appendChild(el); s.el = el; s.v = el.querySelector('.v');
}
function drawStats(t) {
  for (const s of STATS) {
    const on = t >= s.a && t < s.b; s.el.style.display = on ? 'block' : 'none'; if (!on) continue;
    const p = outExpo(prog(s.a, s.a + .5, t)); s.v.textContent = Math.round(s.n * p);
    s.el.style.opacity = ss(s.a, s.a + .1, t);
    s.el.style.transform = `translateY(calc(-50% + ${(1 - outCubic(prog(s.a, s.a + .4, t))) * 40}px))`;
  }
}
// Exploded-view labels
const labelsEl = document.createElement('div'); labelsEl.id = 'labels'; ui.appendChild(labelsEl);
labelsEl.innerHTML = '<svg width="1920" height="1080" viewBox="0 0 1920 1080"></svg>';
const svg = labelsEl.querySelector('svg');
const LABELS = [
  { part: 'ring', b: 'Titanium gimbal', s: 'Aims anywhere', dir: 1, at: 20.8 },
  { part: 'shell', b: 'One-piece shell', s: 'Machined, 0.9 mm', dir: -1, at: 20.95 },
  { part: 'battery', b: 'Curved cell', s: '8 hours of light', dir: 1, at: 21.1 },
  { part: 'board', b: 'V1 chip', s: 'Corrects any angle', dir: -1, at: 21.25 },
  { part: 'engine', b: 'Triple-laser engine', s: 'Bright as daylight', dir: 1, at: 21.4 },
  { part: 'lens', b: 'Sapphire lens', s: 'Nine elements', dir: -1, at: 21.55 },
  { part: 'glass', b: 'Ceramic glass', s: 'Edge to edge', dir: 1, at: 21.7 },
];
for (const l of LABELS) {
  l.el = document.createElement('div'); l.el.className = 'lab'; l.el.innerHTML = `<b>${l.b}</b><span>${l.s}</span>`; labelsEl.appendChild(l.el);
  l.line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.line.setAttribute('stroke', 'rgba(255,255,255,.55)'); l.line.setAttribute('stroke-width', '1.5'); svg.appendChild(l.line);
  l.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); l.dot.setAttribute('r', '3.5'); l.dot.setAttribute('fill', '#fff'); svg.appendChild(l.dot);
}
function drawLabels(t, active) {
  labelsEl.style.display = active ? 'block' : 'none'; if (!active) return;
  const out = 1 - ss(23.55, 23.8, t);
  for (const l of LABELS) {
    const part = dev.parts[l.part]; const off = l.part === 'ring' ? V(.0, 0, 0) : V(0, 0, 0);
    const w = part.localToWorld(off); const dist = camera.position.z - w.z; const v = w.project(camera);
    const x = (v.x + 1) * 960, y = (1 - v.y) * 540;
    // anchor on the top/bottom rim of the part as seen on screen
    const pxPer = 540 / (Math.tan(15 * Math.PI / 180) * dist);
    const rad = { ring: 1, shell: .85, battery: .77, board: .79, engine: .37, lens: .41, glass: .83 }[l.part];
    const yA = y + l.dir * (rad * pxPer * .98 + 6), yL = l.dir > 0 ? 880 : 250;
    const p = outCubic(prog(l.at, l.at + .5, t)) * out;
    const yE = lerp(yA, yL, p);
    l.line.setAttribute('x1', x); l.line.setAttribute('x2', x); l.line.setAttribute('y1', yA); l.line.setAttribute('y2', yE);
    l.line.style.opacity = p; l.dot.setAttribute('cx', x); l.dot.setAttribute('cy', yA); l.dot.style.opacity = p;
    l.el.style.left = x + 'px'; l.el.style.top = (l.dir > 0 ? yL + 10 : yL - 74) + 'px'; l.el.style.opacity = p;
    l.el.style.transform = `translateY(${(1 - p) * 12 * l.dir}px)`;
  }
}
// Finish names
const finEls = ['natural', 'graphite', 'ember'].map((k, i) => { const e = document.createElement('div'); e.className = 'fin'; e.textContent = FINISH[k].label; e.style.left = [440, 960, 1480][i] + 'px'; ui.appendChild(e); return e; });
function drawFin(t) {
  finEls.forEach((e, i) => { const a = 26.85 + i * .12; const on = t >= 26.4 && t < 28.8; e.style.display = on ? 'block' : 'none'; if (!on) return; const p = outCubic(prog(a, a + .5, t)) * (1 - ss(28.5, 28.7, t)); e.style.opacity = p; e.style.transform = `translateY(${(1 - p) * 18}px)`; });
}
// End card
const endEl = document.createElement('div'); endEl.id = 'end';
endEl.innerHTML = `<div class="logo"><svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="56" fill="none" stroke="#f5f5f7" stroke-width="11"/><circle cx="65" cy="65" r="19" fill="#f5f5f7"/></svg><span>Vela</span></div><div class="tag">Everywhere is the screen.</div><div class="when">Coming 2027</div>`;
ui.appendChild(endEl);
const endLogo = endEl.querySelector('.logo'), endTag = endEl.querySelector('.tag'), endWhen = endEl.querySelector('.when');
function drawEnd(t) {
  const on = t >= 31.2; endEl.style.display = on ? 'block' : 'none'; if (!on) return;
  const a = outCubic(prog(31.3, 32.1, t)); endLogo.style.opacity = a; endLogo.style.transform = `scale(${lerp(1.05, 1, outExpo(prog(31.3, 33.4, t)))})`; endLogo.style.filter = a < .999 ? `blur(${(1 - a) * 10}px)` : 'none';
  const b = outCubic(prog(31.95, 32.6, t)); endTag.style.opacity = b; endTag.style.transform = `translateY(${(1 - b) * 16}px)`;
  const c = outCubic(prog(32.3, 32.9, t)); endWhen.style.opacity = c; endWhen.style.transform = `translateY(${(1 - c) * 14}px)`;
}

// ---------- camera helper ----------
function cam(pos, look, fov = 30, roll = 0) {
  camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(look);
  if (roll) camera.rotateZ(roll);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------- shots ----------
function reset() {
  for (const d of [dev, devG, devE]) {
    d.group.visible = d === dev; d.group.position.set(0, 0, 0); d.group.rotation.set(0, 0, 0); d.group.scale.setScalar(1);
    d.setOpen(0); d.setLight(0); d.setExplode(0); d.glassMat.envMap = null; d.glassMat.envMapIntensity = 1;
  }
  wallRoom.visible = tableRoom.visible = ceilRoom.visible = false;
  word.visible = false; glow.visible = false; beam.visible = false;
  projLight.intensity = 0;
  scene.environment = ENV.studio; scene.environmentIntensity = 1; scene.environmentRotation.set(0, 0, 0);
  grade.uniforms.black.value = 0; grade.uniforms.white.value = 0; grade.uniforms.vig.value = .28;
  bloom.strength = .14; bloom.threshold = 2.0;
}

const SHOTS = [
  // ── 0: a single stripe of light tracing the titanium edge
  { a: 0, b: 4.8, f(t, p) {
    scene.environment = ENV.strip;
    scene.environmentIntensity = ss(.15, 1.2, t) * (1 - ss(4.5, 4.8, t) * .8);
    scene.environmentRotation.set(.35, lerp(-2.3, .5, inOut(p)), 0);
    dev.group.rotation.set(1.3, lerp(-.16, .1, p), 0);
    const k = lerp(0, 1, p);
    cam(V(lerp(-.1, .1, k), lerp(.55, .62, k), lerp(3.35, 2.95, k)), V(0, lerp(1.2, 1.17, k), 0), 30, lerp(-.03, .03, k));
    grade.uniforms.black.value = 1 - ss(0, .5, t);
  } },
  // ── 1: into the lens
  { a: 4.8, b: 7.2, f(t, p) {
    scene.environment = ENV.studio;
    scene.environmentIntensity = .55 + p * .5;
    scene.environmentRotation.set(.5, p * 1.6, .2);
    dev.group.rotation.set(Math.PI / 2, 0, 0);
    dev.group.position.y = 0;
    const z = lerp(1.82, .92, inOut(p));
    cam(V(.0, .03, z), V(0, 0, 0), 30, p * .5);
    dev.setLight(ss(5.1, 5.6, t) * .25 + ss(6.1, 7.2, t) * 1.6);
    bloom.strength = .14 + ss(6.3, 7.2, t) * 1.2; bloom.threshold = lerp(2, .9, ss(6.3, 7.2, t));
    grade.uniforms.white.value = Math.pow(ss(6.92, 7.2, t), 2);
    grade.uniforms.vig.value = .4;
  } },
  // ── 2: hero reveal, the device opens
  { a: 7.2, b: 12, f(t, p) {
    word.visible = true; glow.visible = true;
    const q = prog(7.2, 12, t);
    word.material.opacity = ss(7.3, 8.1, t);
    word.position.set(0, 1.08, -3); word.scale.setScalar(lerp(1.06, 1, outCubic(q)));
    word.material.color.setScalar(1.6);
    glow.material.uniforms.power.value = .04 + ss(9.6, 10.6, t) * .08; glow.position.set(0, -.5, -3.2);
    const openT = inOutQuint(prog(9.6, 10.8, t));
    // the ring falls back and becomes the base; the lens keeps looking at you
    dev.setOpen(1.02 * openT);
    dev.setLight(ss(10.2, 10.9, t) * .9);
    dev.group.rotation.set(lerp(1.42, .4, openT), lerp(-.62, .3, inOut(q)), lerp(.1, 0, q));
    dev.group.scale.setScalar(.8);
    dev.group.position.y = lerp(-.58, -.74, openT) + Math.sin(t * 1.4) * .01;
    scene.environmentRotation.set(0, lerp(-1.1, .95, q), 0);
    scene.environmentIntensity = .4 + outCubic(prog(7.2, 8.1, t)) * .75;
    const z = lerp(8.6, 7.6, outCubic(q));
    cam(V(0, 0, z), V(0, -.03, 0), 30);
    grade.uniforms.white.value = (1 - ss(7.2, 7.72, t)) * .85;
  } },
  // ── 3: a wall becomes a cinema
  { a: 12, b: 14.4, f(t, p) {
    wallRoom.visible = true; const on = outExpo(prog(12.0, 12.45, t));
    scene.environment = ENV.room; scene.environmentIntensity = 1.5;
    duneMat.uniforms.t.value = t - 10; duneMat.uniforms.power.value = on * 1.05;
    picRefl.material.uniforms.t.value = t - 10; picRefl.material.uniforms.power.value = on * .07;
    wallHalo.material.uniforms.power.value = on * .3;
    dev.group.scale.setScalar(.4); dev.group.position.set(1.5, .09, 1.7);
    dev.group.rotation.set(0, .12, 0); dev.setOpen(-1.33); dev.setLight(on * .9);
    dev.group.updateMatrixWorld(true);
    aimBeam(lensWorld(dev), V(0, PIC_Y, -5.9), PIC_W * .52, PIC_H * .54, on * .2, new THREE.Color(1, .72, .5));
    dustMat.uniforms.t.value = t;
    projLight.color.setRGB(1, .55, .35); projLight.intensity = on * 9; projLight.position.set(0, 2.9, -5.2);
    const k = inOut(p);
    cam(V(lerp(-.1, .1, k), lerp(.82, .8, k), lerp(6.3, 5.7, k)), V(lerp(.22, .28, k), lerp(1.72, 1.7, k), -6), 34);
  } },
  // ── 4: a table becomes a studio
  { a: 14.4, b: 16.8, f(t, p) {
    tableRoom.visible = true; const on = outExpo(prog(14.4, 14.85, t));
    scene.environment = ENV.room; scene.environmentIntensity = .52;
    drawUI(t - 14.4); uiPlane.material.color.setScalar(on * 1.25); tableHalo.material.uniforms.power.value = on * .3;
    dev.group.scale.setScalar(.44); dev.group.position.set(0, .44, -1.5);
    dev.group.rotation.set(Math.PI / 2 - .02, 0, 0); dev.setOpen(.52); dev.setLight(on * .9);
    dev.group.updateMatrixWorld(true);
    aimBeam(lensWorld(dev), V(0, .01, .96), UI_W * .54, UI_H * .46, on * .045, new THREE.Color(.82, .84, 1));
    dustMat.uniforms.t.value = t;
    projLight.color.setRGB(.75, .78, 1); projLight.intensity = on * 5; projLight.position.set(0, 2.4, .9);
    const k = inOut(p);
    cam(V(lerp(-.7, -.25, k), lerp(5.9, 5.5, k), lerp(5.6, 5.3, k)), V(lerp(.12, .1, k), 0, lerp(.1, .02, k)), 34, 0);
  } },
  // ── 5: a ceiling becomes the sky
  { a: 16.8, b: 19.2, f(t, p) {
    ceilRoom.visible = true; const on = outExpo(prog(16.8, 17.3, t));
    scene.environment = ENV.room; scene.environmentIntensity = 1.3;
    starMat.uniforms.t.value = t - 16.8; starMat.uniforms.power.value = on * 1.2;
    dev.group.scale.setScalar(.36); dev.group.position.set(1.0, .04, .2);
    dev.group.rotation.set(0, .3, 0); dev.setOpen(-.26); dev.setLight(on * .9);
    dev.group.updateMatrixWorld(true);
    aimBeam(lensWorld(dev), V(0, 7, -5.5), 6, 6, on * .05, new THREE.Color(.7, .78, 1));
    dustMat.uniforms.t.value = t;
    projLight.color.setRGB(.5, .6, 1); projLight.intensity = on * 30; projLight.position.set(-.2, 5.2, -4);
    const k = inOut(p);
    cam(V(lerp(0, .15, k), lerp(.72, .68, k), lerp(3.4, 3.0, k)), V(lerp(.05, .12, k), lerp(2.02, 2.15, k), -2), 62);
  } },
  // ── 6: exploded view
  { a: 19.2, b: 24, f(t, p) {
    const ex = prog(19.55, 20.95, t) * (1 - prog(23.5, 24.0, t));
    dev.setExplode(ex); dev.setLight(.55); dev.glassMat.envMap = ENV.studio; dev.glassMat.envMapIntensity = lerp(1, .32, ss(19.55, 20.4, t));
    // axis runs left–right, turned so each layer shows its face
    dev.group.rotation.set(lerp(.13, .09, p), lerp(-.9, -.72, inOut(p)), -Math.PI / 2);
    dev.group.position.set(-.3, -.14, 0);
    scene.environmentRotation.set(0, p * 1.4 - .3, 0); scene.environmentIntensity = 1.5;
    cam(V(0, 0, lerp(7.9, 7.4, inOut(p))), V(0, 0, 0), 30);
  } },
  // ── 7: stats (three beats, three angles)
  { a: 24, b: 26.4, f(t, p) {
    const i = Math.min(2, Math.floor((t - 24) / .8)); const q = ((t - 24) % .8) / .8;
    scene.environmentRotation.set(0, q * .9 + i * 2, 0); scene.environmentIntensity = .95;
    if (i === 0) { dev.group.position.set(2.0, -.25, 0); dev.group.rotation.set(.36, lerp(-.55, -.32, q), 0); dev.setOpen(.95); dev.setLight(.8); }
    if (i === 1) { dev.group.position.set(-2.1, 0, 0); dev.group.rotation.set(.2, lerp(.75, .98, q), -.1); }
    if (i === 2) { dev.group.position.set(2.0, .06, 0); dev.group.rotation.set(1.42, lerp(.5, .28, q), -.06); dev.setLight(1); }
    cam(V(0, 0, 8.6 - q * .28), V(0, 0, 0), 30);
  } },
  // ── 8: the finishes
  { a: 26.4, b: 28.8, f(t, p) {
    const trio = [dev, devG, devE], x = [-2.33, 0, 2.33];
    trio.forEach((d, i) => {
      d.group.visible = true;
      const e = outExpo(prog(26.4 + i * .09, 27.25 + i * .09, t));
      d.group.position.set(x[i] + (1 - e) * 1.6, lerp(-.9, 0, e) + .04, 0);
      d.group.rotation.set(lerp(1.3, .36, e), lerp(-1.8, 0, e) + (t - 27.5) * .13, 0);
      d.group.scale.setScalar(.97);
      d.setOpen(.98 * e); d.setLight(ss(27.4 + i * .1, 27.8 + i * .1, t) * .75);
    });
    scene.environmentRotation.set(0, lerp(-.5, .7, p), 0); scene.environmentIntensity = 1.25;
    cam(V(0, .05, 8.7), V(0, -.06, 0), 30);
  } },
  // ── 9: finale, the light turns to you
  { a: 28.8, b: 31.2, f(t, p) {
    glow.visible = true; glow.material.uniforms.power.value = .03 + p * .05; glow.position.set(0, 0, -3.2);
    const push = inOut(prog(30.35, 31.2, t));
    dev.group.rotation.set(lerp(.42, Math.PI / 2, push), lerp(.3, 0, push), 0);
    dev.setOpen(1.0 * (1 - push));
    dev.group.position.set(0, lerp(-.8, 0, push), 0); dev.group.scale.setScalar(.82);
    dev.setLight(.7 + ss(30.2, 31.2, t) * 2.2);
    scene.environmentIntensity = 1 * (1 - ss(30.4, 31.1, t) * .6); scene.environmentRotation.set(0, p * 1.4, 0);
    bloom.strength = .14 + ss(30.4, 31.2, t) * 1.2; bloom.threshold = lerp(2, .9, ss(30.4, 31.2, t));
    grade.uniforms.white.value = Math.pow(ss(30.92, 31.2, t), 2.2);
    cam(V(0, 0, lerp(8.8, 1.9, Math.pow(push, 1.5))), V(0, 0, 0), 30);
  } },
  // ── 10: end card over black
  { a: 31.2, b: 36, f(t, p) {
    dev.group.visible = false;
    cam(V(0, 0, 9), V(0, 0, 0), 30);
    grade.uniforms.white.value = (1 - ss(31.2, 31.9, t));
    grade.uniforms.vig.value = 0;
  } },
];

async function renderAt(t) {
  reset();
  const s = SHOTS.find(s => t >= s.a && t < s.b) ?? SHOTS[SHOTS.length - 1];
  s.f(t, prog(s.a, s.b, t));
  grade.uniforms.t.value = t;
  scene.updateMatrixWorld(true);
  composer.render();
  drawCaps(t); drawStats(t); drawFin(t); drawEnd(t);
  drawLabels(t, t >= 19.2 && t < 24);
  // Fade the type & the film to black together at the very end.
  ui.style.opacity = 1 - ss(34.2, 34.9, t);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}
window.renderAt = renderAt;
window.DURATION = DURATION;
await renderAt(0);
window.READY = true;

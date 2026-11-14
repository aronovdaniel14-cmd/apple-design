// OTO — launch film. Every frame is a pure function of time; the bass envelope comes from the actual track.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1920, H = 1080;
const audio = await (await fetch(new URL('./env.json', import.meta.url))).json();
const E = t => audio.env[clamp(Math.floor(t * audio.fps), 0, audio.env.length - 1)] ?? 0;

function clamp(x, a = 0, b = 1) { return Math.min(b, Math.max(a, x)); }
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const prog = (a, b, x) => clamp((x - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = t => 1 - Math.pow(1 - t, 3);
const outExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const outBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const C = {
  white: '#f5f5f7', ink: '#141418', tangerine: '#ff5e14', cobalt: '#1f3dff', mint: '#22dd9c',
  blush: '#ff78ad', lemon: '#ffd21f', violet: '#6d33ff', red: '#ff2d3f',
};
const col = h => new THREE.Color(h);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.insertBefore(renderer.domElement, document.getElementById('ui'));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, W / H, .05, 200);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), .03).texture;

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 8 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, t: { value: 0 }, white: { value: 0 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float t,white;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+t*61.7)*43758.5453);}
    void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c=mix(c,vec3(.961,.961,.969),white);c+=(h(vUv*1000.)-.5)*.006;gl_FragColor=vec4(c,1.);}`,
});
composer.addPass(grade);

const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(-4.5, 9, 6); key.castShadow = true;
key.shadow.mapSize.set(4096, 4096); key.shadow.radius = 11; key.shadow.blurSamples = 25; key.shadow.bias = -.0005;
Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: .5, far: 40 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(6, 3, -5); scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: .3 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -1.72; ground.receiveShadow = true; scene.add(ground);

// ---------- speaker grille: Fibonacci perforations, stretched so they stay round on a sphere ----------
function grille(mode) {
  const c = document.createElement('canvas'); c.width = 4096; c.height = 2048;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 4096, 2048);
  g.fillStyle = mode === 'map' ? 'rgb(120,120,120)' : '#000';
  const n = 11000, gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + .5) / n, th = Math.acos(y), ph = (i * gold) % (Math.PI * 2);
    const u = ph / (Math.PI * 2) * 4096, v = th / Math.PI * 2048, s = Math.max(Math.sin(th), .05), r = 6.2;
    g.beginPath(); g.ellipse(u, v, r / s, r, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = mode === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}
const gMap = grille('map'), gBump = grille('bump');

const P = (x, y) => new THREE.Vector2(Math.max(x, 0), y);
function discProfile(r, h, e) {
  const pts = [P(0, -h / 2)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push(P(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e)); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(P(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e)); }
  pts.push(P(0, h / 2)); return pts;
}
const HOVER = 1.46; // sphere centre above base top

function makeOto(hex) {
  const group = new THREE.Group(), ball = new THREE.Group(); group.add(ball);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshPhysicalMaterial({
    color: col(hex), map: gMap, bumpMap: gBump, bumpScale: 1.6, roughness: .62, sheen: .25, sheenRoughness: .6, sheenColor: col(hex),
  }));
  body.castShadow = true; ball.add(body);
  const capMat = new THREE.MeshPhysicalMaterial({ color: col(hex).multiplyScalar(.75), roughness: .16, clearcoat: 1, clearcoatRoughness: .05 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 24, 0, Math.PI * 2, 0, .5), capMat); ball.add(cap);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(Math.sin(.5) * 1.004, .009, 12, 128), new THREE.MeshStandardMaterial({ color: 0, emissive: col('#ffffff'), emissiveIntensity: 1.3 }));
  halo.rotation.x = Math.PI / 2; halo.position.y = Math.cos(.5) * 1.004; ball.add(halo);
  const foot = new THREE.Mesh(new THREE.SphereGeometry(1.003, 96, 24, 0, Math.PI * 2, Math.PI - .56, .56), new THREE.MeshPhysicalMaterial({ color: 0x1b1b20, metalness: .9, roughness: .3 })); ball.add(foot);
  const base = new THREE.Group(); base.position.y = -HOVER - .08; group.add(base);
  const puck = new THREE.Mesh(new THREE.LatheGeometry(discProfile(.86, .14, .05), 128), new THREE.MeshPhysicalMaterial({ color: col(hex), roughness: .4, clearcoat: .5 }));
  puck.castShadow = true; base.add(puck);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .004, 96), new THREE.MeshPhysicalMaterial({ color: 0x17171b, roughness: .12, clearcoat: 1 })); inner.position.y = .071; base.add(inner);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0, emissive: col('#ffffff'), emissiveIntensity: 1.6 });
  const led = new THREE.Mesh(new THREE.TorusGeometry(.62, .011, 10, 128), ledMat); led.rotation.x = Math.PI / 2; led.position.y = .074; base.add(led);
  return {
    group, ball, base, body, ledMat,
    /** Pose: lift above rest, squash from bass 0..1, turn. */
    pose(lift, bassAmt, spin = 0) {
      ball.position.y = lift - bassAmt * .07;
      const s = bassAmt * .05; ball.scale.set(1 + s, 1 - s, 1 + s); ball.rotation.y = spin;
      ledMat.emissiveIntensity = 1.2 + bassAmt * 2.2;
    },
    setColor(hex2) {
      const c = col(hex2); body.material.color.copy(c); body.material.sheenColor.copy(c);
      capMat.color.copy(c.clone().multiplyScalar(.75)); puck.material.color.copy(c);
    },
  };
}
await document.fonts.load('800 400px "Inter Tight"'); await document.fonts.load('500 24px "Inter"');
const oto = makeOto(C.tangerine); scene.add(oto.group);
const oto2 = makeOto(C.tangerine); scene.add(oto2.group);
const crew = [C.tangerine, C.cobalt, C.mint, C.blush, C.ink].map(c => { const o = makeOto(c); scene.add(o.group); return o; });

// ---------- huge words as 3D planes, so the speaker can pass in front of them ----------
const wordCache = new Map();
function wordTex(text) {
  if (wordCache.has(text)) return wordCache.get(text);
  const c = document.createElement('canvas'); c.width = 4096; c.height = 1024; const g = c.getContext('2d');
  g.font = '800 680px "Inter Tight"'; g.letterSpacing = '-34px'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(text, 2048, 760);
  const w = g.measureText(text).width;
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  const e = { t, w }; wordCache.set(text, e); return e;
}
const wordMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, .25), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
scene.add(wordMesh);
function showWord(text, color, y = 0, z = -2.5, widthWorld = 9.6, pop = 1, x = 0) {
  const e = wordTex(text); wordMesh.visible = true; wordMesh.material.map = e.t; wordMesh.material.color.set(color); wordMesh.material.needsUpdate = true;
  const fit = Math.min(widthWorld * 4096 / e.w, 13.8) * pop; wordMesh.scale.set(fit, fit, 1); wordMesh.position.set(x, y, z);
}

// ---------- sound rings: one per kick, flat and graphic ----------
const rings = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(.985, 1, 128), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); scene.add(m); return m; });
function showRings(t, pos, color, life = .9, reach = 5.5, baseR = 1, thick = 1) {
  let i = 0; rings.forEach(r => r.visible = false);
  for (const k of audio.kicks) {
    const a = t - k; if (a < 0 || a > life || i >= rings.length) continue;
    const r = rings[i++], p = a / life; r.visible = true; r.position.copy(pos);
    r.scale.setScalar(baseR + outCubic(p) * reach); r.material.color.set(color); r.material.opacity = (1 - p) * .6 * thick;
  }
}

// ---------- the wave field ----------
const FX = 76, FZ = 50, FSP = .3;
const field = new THREE.InstancedMesh(new THREE.SphereGeometry(.128, 18, 14), new THREE.MeshPhysicalMaterial({ color: col(C.violet), roughness: .42, clearcoat: .35 }), FX * FZ);
field.castShadow = field.receiveShadow = true; field.frustumCulled = false; scene.add(field);
const mtx = new THREE.Matrix4();
function drawField(t) {
  const kicks = audio.kicks.filter(k => k <= t && t - k < 1.4);
  let n = 0;
  for (let ix = 0; ix < FX; ix++) for (let iz = 0; iz < FZ; iz++) {
    const x = (ix - FX / 2 + .5 + (iz % 2) * .5) * FSP, z = (iz - FZ / 2 + .5) * FSP * .87;
    const r = Math.hypot(x, z); let y = 0;
    for (const k of kicks) { const a = t - k, d = (r - a * 8.2) / 1.05; y += Math.exp(-d * d) * Math.exp(-a * 1.05) * .95; }
    y += Math.sin(r * 1.5 - t * 2.2) * .035;
    mtx.makeTranslation(x, -1.45 + y, z); field.setMatrixAt(n++, mtx);
  }
  field.instanceMatrix.needsUpdate = true;
}

// ---------- color panels ----------
const panels = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false })); scene.add(m); return m; });

// ---------- cutaway ----------
const cut = new THREE.Group(); scene.add(cut);
const shellMat = new THREE.MeshPhysicalMaterial({ color: col(C.tangerine), map: gMap, bumpMap: gBump, bumpScale: 1.6, roughness: .62, sheen: .25, sheenRoughness: .6, sheenColor: col(C.tangerine) });
const shellIn = new THREE.MeshPhysicalMaterial({ color: 0x0e0e11, roughness: .85, side: THREE.BackSide });
const halves = [0, 1].map(i => {
  const g = new THREE.Group(), phi = i === 0 ? Math.PI / 2 : Math.PI * 1.5;
  const geo = new THREE.SphereGeometry(1, 128, 96, phi, Math.PI);
  const o = new THREE.Mesh(geo, shellMat); o.castShadow = true; g.add(o); g.add(new THREE.Mesh(new THREE.SphereGeometry(.975, 96, 64, phi, Math.PI), shellIn));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.988, .014, 10, 128), new THREE.MeshStandardMaterial({ color: 0x34343a, roughness: .5 })); lip.rotation.y = Math.PI / 2; g.add(lip);
  cut.add(g); return g;
});
const metal = new THREE.MeshPhysicalMaterial({ color: 0xb9bcc4, metalness: 1, roughness: .28 });
const dark = new THREE.MeshPhysicalMaterial({ color: 0x18181c, metalness: .3, roughness: .5 });
const core = new THREE.Group(); cut.add(core);
// woofer, facing the camera
const woofer = new THREE.Group(); woofer.rotation.x = Math.PI / 2; woofer.scale.setScalar(.82); woofer.position.z = .06; core.add(woofer);
const conePts = []; for (let i = 0; i <= 24; i++) { const a = i / 24; conePts.push(P(.2 + a * .42, -.17 + Math.pow(a, 1.5) * .25)); }
const coneMesh = new THREE.Mesh(new THREE.LatheGeometry(conePts.reverse(), 96), new THREE.MeshPhysicalMaterial({ color: 0x4a4a52, roughness: .55, side: THREE.DoubleSide })); woofer.add(coneMesh);
const dust = new THREE.Mesh(new THREE.SphereGeometry(.205, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xd9dbe0, metalness: 1, roughness: .22 })); dust.scale.y = .46; dust.position.y = -.17; woofer.add(dust);
const surround = new THREE.Mesh(new THREE.TorusGeometry(.64, .034, 16, 128), dark); surround.rotation.x = Math.PI / 2; surround.position.y = .08; woofer.add(surround);
const basket = new THREE.Mesh(new THREE.TorusGeometry(.69, .024, 16, 128), metal); basket.rotation.x = Math.PI / 2; basket.position.y = .08; woofer.add(basket);
const coilM = new THREE.MeshStandardMaterial({ color: 0x3a1a05, emissive: col('#ff8a2a'), emissiveIntensity: 1.1, metalness: .4, roughness: .4 });
const coil = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .2, 64), metal); coil.rotation.x = Math.PI / 2; coil.position.z = -.3; core.add(coil);
const coilBand = new THREE.Mesh(new THREE.CylinderGeometry(.312, .312, .05, 64), coilM); coilBand.rotation.x = Math.PI / 2; coilBand.position.z = -.3; core.add(coilBand);
// six tweeters ringed around the woofer, on one baffle
const tweets = [];
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2 + Math.PI / 2, g = new THREE.Group();
  g.position.set(Math.cos(a) * .74, Math.sin(a) * .74, .03);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(.115, .115, .04, 40), metal); can.rotation.x = Math.PI / 2; g.add(can);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(.092, .092, .042, 40), dark); well.rotation.x = Math.PI / 2; g.add(well);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.066, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xf0d9b0, metalness: 1, roughness: .16 })); dome.rotation.x = Math.PI / 2; dome.position.z = .02; dome.scale.y = .7; g.add(dome);
  core.add(g); tweets.push(g);
}
const baffle = new THREE.Mesh(new THREE.CylinderGeometry(.95, .95, .05, 128), new THREE.MeshPhysicalMaterial({ color: 0x26262c, metalness: .7, roughness: .46 })); baffle.rotation.x = Math.PI / 2; baffle.position.z = -.03; core.add(baffle);
const bafRim = new THREE.Mesh(new THREE.TorusGeometry(.95, .012, 10, 128), metal); bafRim.position.z = -.005; core.add(bafRim);
const magnet = new THREE.Mesh(new THREE.CylinderGeometry(.56, .62, .1, 64), new THREE.MeshPhysicalMaterial({ color: 0xc78a3a, metalness: 1, roughness: .28 })); magnet.position.y = -1.03; core.add(magnet);

// ---------- DOM ----------
const ui = document.getElementById('ui');
const CAPS = [
  { a: 1.3, b: 2.95, text: 'Every speaker just sits there.', y: 120, size: 84, color: C.ink },
  { a: 3.0, b: 3.95, text: 'Not this one.', y: 120, size: 84, color: C.ink },
  { a: 9.05, b: 11.85, text: 'The speaker that floats.', y: 880, size: 66, color: '#fff' },
  { a: 12.2, b: 15.85, text: 'Sound in every direction. Every seat is the best seat.', y: 70, size: 54, color: '#fff' },
  { a: 16.3, b: 19.85, text: 'Seven drivers. Zero strings attached.', y: 64, size: 66, color: '#f5f5f7' },
  { a: 20.15, b: 23.45, text: 'Louder lifts it higher.', y: 880, size: 60, color: '#fff', left: 120 },
  { a: 24.25, b: 27.9, text: 'Five colors. All of them loud.', y: 70, size: 70, color: '#fff' },
];
for (const c of CAPS) {
  const el = document.createElement('div'); el.className = 'cap'; el.style.top = c.y + 'px'; el.style.fontSize = c.size + 'px'; el.style.color = c.color;
  if (c.left) { el.style.textAlign = 'left'; el.style.left = c.left + 'px'; }
  el.innerHTML = c.text.split(' ').map(w => `<span class="w">${w}</span>`).join(' ');
  ui.appendChild(el); c.el = el; c.words = [...el.querySelectorAll('.w')];
}
function drawCaps(t) {
  for (const c of CAPS) {
    const on = t >= c.a && t < c.b; c.el.style.display = on ? 'block' : 'none'; if (!on) continue;
    const out = 1 - ss(c.b - .12, c.b, t);
    c.words.forEach((w, i) => {
      const p = prog(c.a + i * .045, c.a + i * .045 + .34, t), q = outBack(p);
      w.style.opacity = Math.min(p * 3, 1) * out; w.style.transform = `translateY(${(1 - q) * 34}px) scale(${lerp(.92, 1, q)})`;
    });
  }
}
const vol = document.createElement('div'); vol.className = 'vol'; vol.innerHTML = '<small>Volume</small><span>0</span>'; ui.appendChild(vol); const volN = vol.querySelector('span');
const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); lines.setAttribute('class', 'lines'); lines.setAttribute('width', 1920); lines.setAttribute('height', 1080); ui.appendChild(lines);
const LABS = [
  { b: '4″ woofer', s: 'Moves more air than it should', at: 17.05, x: 1120, y: 866, get: () => V(.3, -.26, .2) },
  { b: 'Six tweeters', s: 'A full 360° of detail', at: 17.3, x: 1090, y: 166, get: () => V(.05, .78, .1) },
  { b: 'Maglev coil', s: 'Lifts 1.2 kg. Silently.', at: 17.55, x: 520, y: 866, get: () => V(-.42, -1.03, .1) },
];
for (const l of LABS) { l.el = document.createElement('div'); l.el.className = 'lab'; l.el.innerHTML = `${l.b}<span>${l.s}</span>`; ui.appendChild(l.el); l.line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.line.setAttribute('stroke', 'rgba(255,255,255,.65)'); l.line.setAttribute('stroke-width', '1.6'); lines.appendChild(l.line); }
function drawLabs(t) {
  const on = t >= 16 && t < 20;
  for (const l of LABS) {
    l.el.style.display = l.line.style.display = on ? 'block' : 'none'; if (!on) continue;
    const p = outCubic(prog(l.at, l.at + .45, t)) * (1 - ss(19.75, 19.95, t));
    const v = l.get().applyMatrix4(cut.matrixWorld).project(camera), sx = (v.x + 1) * 960, sy = (1 - v.y) * 540;
    l.el.style.left = l.x + 'px'; l.el.style.top = l.y + 'px'; l.el.style.opacity = p;
    const tx = l.x + (sx > l.x ? l.el.offsetWidth + 10 : -10), ty = l.y + 20;
    l.line.setAttribute('x1', sx); l.line.setAttribute('y1', sy); l.line.setAttribute('x2', lerp(sx, tx, p)); l.line.setAttribute('y2', lerp(sy, ty, p)); l.line.style.opacity = p;
  }
}
const NAMES = ['Tangerine', 'Cobalt', 'Mint', 'Blush', 'Ink'].map((n, i) => { const e = document.createElement('div'); e.className = 'name'; e.textContent = n; e.style.left = i * 384 + 'px'; e.style.color = '#fff'; ui.appendChild(e); return e; });
const endEl = document.createElement('div'); endEl.id = 'end'; endEl.innerHTML = '<div class="logo">oto</div><div class="tag">Music, off the ground.</div><div class="when">Coming 2027</div>'; ui.appendChild(endEl);
const [eLogo, eTag, eWhen] = endEl.children;

// ---------- camera ----------
function cam(pos, look, fov = 28, roll = 0) { camera.position.copy(pos); camera.lookAt(look); if (roll) camera.rotateZ(roll); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } }
const bg = c => { scene.background = col(c); };

function reset() {
  for (const o of [oto, oto2, ...crew]) { o.group.visible = false; o.group.position.set(0, 0, 0); o.group.rotation.set(0, 0, 0); o.group.scale.setScalar(1); o.pose(0, 0, 0); o.base.visible = true; }
  oto.group.visible = true; oto.setColor(C.tangerine);
  wordMesh.visible = false; rings.forEach(r => r.visible = false); field.visible = false; cut.visible = false;
  panels.forEach(p => p.visible = false); ground.visible = true; ground.position.y = -1.72; ground.material.opacity = .3;
  scene.environmentIntensity = .5; key.intensity = 2.2; rim.intensity = .7; grade.uniforms.white.value = 0;
  cam(V(0, 0, 11), V(0, 0, 0), 28);
}

const BEATS = [
  { w: 'Big.', bg: C.cobalt, ball: C.tangerine, ink: '#fff', x: 3.2, y: -.15, wx: -1.5, ww: 6.2 },
  { w: 'Round.', bg: C.tangerine, ball: C.cobalt, ink: '#fff', x: -3.25, y: .1, wx: 1.55, ww: 7.8 },
  { w: 'Loud.', bg: C.mint, ball: C.violet, ink: C.ink, x: 3.25, y: 0, wx: -1.6, ww: 7.2 },
  { w: 'Sound.', bg: C.blush, ball: C.lemon, ink: '#fff', x: -3.25, y: .1, wx: 1.55, ww: 7.8 },
  { w: 'Off', bg: C.lemon, ball: C.red, ink: C.ink, x: 3.2, y: .2, wx: -1.5, ww: 6.2 },
  { w: 'the', bg: C.violet, ball: C.mint, ink: '#fff', x: -3.2, y: .1, wx: 1.5, ww: 6.4 },
  { w: 'ground.', bg: C.red, ball: C.lemon, ink: '#fff', x: 0, y: 1.05, hold: true, wx: 0, ww: 10.8 },
];

const SHOTS = [
  // 0–4: a white room, it falls and refuses to land
  { a: 0, b: 4, f(t) {
    bg(C.white); ground.material.opacity = .2;
    const fall = prog(.5, 1.0, t);
    const dropY = t < 1 ? lerp(7.5, 0, fall * fall) : -.62 * Math.exp(-(t - 1) * 3.4) * Math.cos((t - 1) * 8.2);
    const lift = ss(3.0, 3.9, t) * .28;
    oto.ball.position.y = dropY; oto.pose(dropY + lift + Math.sin(t * 2) * .012 * ss(1.5, 2.2, t), 0, (t - 1) * .3);
    oto.group.position.y = -.3; oto.group.scale.setScalar(1.02);
    showRings(t < 1 ? -9 : t, V(0, -.3, -1.5), '#c9c9cf', 1.2, 3);
    cam(V(0, .2, lerp(12, 10.6, inOut(prog(0, 4, t)))), V(0, -.02, 0));
  } },
  // 4–8: the drop, one word and one color per beat
  { a: 4, b: 8, f(t) {
    const i = Math.min(BEATS.length - 1, Math.floor((t - 4) / .5)), b = BEATS[i], q = (t - 4 - i * .5);
    bg(b.bg); oto.setColor(b.ball);
    showWord(b.w, b.ink, -.1, -2.6, b.ww, lerp(1.1, 1, outExpo(prog(0, .32, q))), b.wx);
    oto.group.position.set(b.x, b.y - .1, 0); oto.group.scale.setScalar(b.hold ? .78 : .78);
    if (b.hold) { oto.group.position.y = lerp(-.6, 1.32, outBack(prog(0, .5, q))); oto.base.visible = false; wordMesh.position.y = -1.05; }
    oto.pose(Math.sin(t * 6) * .02, E(t), t * .7);
    ground.position.y = -1.9;
    showRings(t, oto.group.position.clone().setZ(-1.2), '#fff', .6, 3.2, .9, .8);
    cam(V(0, 0, 11), V(0, 0, 0), 28, (i % 2 ? 1 : -1) * .012);
  } },
  // 8–12: the name: two speakers are the two o's
  { a: 8, b: 12, f(t) {
    bg(C.cobalt); ground.visible = false;
    const e0 = outBack(prog(8, 8.4, t)), e1 = outBack(prog(8.14, 8.54, t));
    oto.group.visible = oto2.group.visible = true; oto.setColor(C.tangerine); oto2.setColor(C.lemon);
    oto.group.position.set(-2.72, .1 + (1 - e0) * -6, 0); oto2.group.position.set(2.72, .1 + (1 - e1) * -6, 0);
    oto.group.scale.setScalar(1.28); oto2.group.scale.setScalar(1.28);
    oto.base.visible = oto2.base.visible = false;
    const flip = Math.floor(t * 2) % 2 === 0, en = E(t);
    oto.pose(flip ? .18 * en : -.04 * en, flip ? en : en * .25, t * .6); oto2.pose(flip ? -.04 * en : .18 * en, flip ? en * .25 : en, -t * .6);
    showWord('t', '#fff', 0, 0, 9, 1.9 * lerp(.82, 1, outBack(prog(8.3, 8.7, t))));
    wordMesh.position.y = .23; wordMesh.material.opacity = ss(8.28, 8.42, t);
    cam(V(0, 0, lerp(11.6, 10.9, inOut(prog(8, 12, t)))), V(0, -.04, 0));
  } },
  // 12–16: the room feels it, a field of spheres rides each kick
  { a: 12, b: 16, f(t, p) {
    bg(C.violet); field.visible = true; drawField(t); ground.visible = false; key.intensity = 3.1;
    oto.setColor(C.tangerine); oto.base.visible = false; oto.group.position.set(0, 1.0, 0); oto.group.scale.setScalar(.88);
    oto.pose(Math.sin(t * 2) * .03, E(t), t * .5);
    const a = lerp(-.32, .32, inOut(p));
    cam(V(Math.sin(a) * 11.4, lerp(5.8, 6.5, p), Math.cos(a) * 11.4), V(0, -.08, 0), 28);
  } },
  // 16–20: open it up
  { a: 16, b: 20, f(t, p) {
    bg('#0d0d10'); ground.material.opacity = .4; ground.position.y = -1.8; scene.environmentIntensity = .95;
    oto.group.visible = false; cut.visible = true; cut.scale.setScalar(1.5); cut.position.set(0, -.12, 0);
    const o = outExpo(prog(16.15, 17, t)) * (1 - inOut(prog(19.65, 20, t)));
    halves[0].position.x = o * 2.55; halves[1].position.x = -o * 2.55;
    halves[0].rotation.y = o * .8; halves[1].rotation.y = o * -.8;
    core.visible = o > .004;
    cut.rotation.y = lerp(-.3, .22, inOut(p)); cut.rotation.x = .07;
    const e = E(t); coneMesh.position.y = dust.position.y * 0 + e * .05; dust.position.y = -.17 + e * .06;
    coilM.emissiveIntensity = .7 + e * 3.2;
    cam(V(0, .1, lerp(13, 12, inOut(p))), V(0, -.02, 0));
  } },
  // 20–24: louder lifts it higher
  { a: 20, b: 24, f(t, p) {
    bg(C.tangerine); oto.setColor(C.white); ground.position.y = -2.32; ground.material.opacity = .2;
    const beat = clamp(Math.floor((t - 20) / .5), 0, 7), s = outBack(prog(0, .22, t - 20 - beat * .5));
    const v = lerp(beat / 8, (beat + 1) / 8, s); // steps up on each beat
    oto.group.position.set(2.5, -.75, 0); oto.group.scale.setScalar(.88);
    oto.pose(v * 2.35 + Math.sin(t * 22) * .006 * v, E(t) * .8, t * (1 + v * 4));
    showRings(t, V(2.5, -2.12, -.2), '#fff', .7, 1.3, .6, .8);
    rings.forEach(r => { if (r.visible) { r.rotation.x = -Math.PI / 2 + .12; r.position.y += (r.scale.x - .6) * .72; } });
    vol.style.display = 'block'; volN.textContent = Math.round(v * 100);
    cam(V(0, 0, 11), V(0, 0, 0));
  } },
  // 24–28: five colors on color
  { a: 24, b: 28, f(t) {
    bg(C.ink); ground.position.y = -1.42; ground.material.opacity = .26;
    const PN = [C.cobalt, C.tangerine, '#07785a', '#c4196b', C.violet];
    const vw = 2 * Math.tan(14 * Math.PI / 180) * 13.4 * W / H, vh = vw * H / W;
    panels.forEach((m, i) => {
      m.visible = true; m.material.color.set(PN[i]);
      const e = outExpo(prog(24 + i * .07, 24.6 + i * .07, t));
      m.scale.set(vw / 5 + .01, vh * e, 1); m.position.set((i - 2) * vw / 5, (1 - e) * (i % 2 ? vh / 2 : -vh / 2), -2.4);
    });
    crew.forEach((o, i) => {
      o.group.visible = true; const e = outBack(prog(24.15 + i * .07, 24.7 + i * .07, t));
      o.group.position.set((i - 2) * 1.95, -.08 + (1 - e) * -6, 0); o.group.scale.setScalar(.62);
      const sel = (Math.floor((t - 24) / .25)) % 5 === i, hop = sel ? Math.sin(((t - 24) % .25) / .25 * Math.PI) * .32 : 0;
      o.pose(hop + Math.sin(t * 2 + i) * .03, E(t) * .9, t * .8 + i);
    });
    oto.group.visible = oto === crew[0];
    cam(V(0, 0, 11), V(0, 0, 0));
  } },
  // 28–32: silence, then it comes home
  { a: 28, b: 36, f(t) {
    bg(C.white); ground.position.y = -1.0; ground.material.opacity = .2;
    const up = outCubic(prog(28, 28.7, t));
    const settle = inOut(prog(29.1, 30, t));
    const hop = t > 30 ? Math.sin(prog(30, 30.4, t) * Math.PI) * .32 : 0;
    oto.group.position.set(0, lerp(.25, 1.0, inOut(prog(30, 30.6, t))), 0); oto.group.scale.setScalar(lerp(1.2, .72, inOut(prog(30, 30.6, t))));
    oto.pose(lerp(.62 * up, .0, settle) + hop, t > 30 ? E(t) * .5 : 0, t * .3);
    ground.position.y = oto.group.position.y - (HOVER + .16) * oto.group.scale.x;
    showRings(t > 30 ? t : -9, oto.group.position.clone().setZ(-1), '#d0d0d6', 1.1, 3.2, .8);
    cam(V(0, 0, 11), V(0, 0, 0));
    grade.uniforms.white.value = ss(33.4, 33.9, t);
  } },
];

async function renderAt(t) {
  reset(); vol.style.display = 'none';
  const s = SHOTS.find(s => t >= s.a && t < s.b) ?? SHOTS[SHOTS.length - 1];
  s.f(t, prog(s.a, s.b, t));
  grade.uniforms.t.value = t;
  scene.updateMatrixWorld(true);
  composer.render();
  drawCaps(t); drawLabs(t);
  NAMES.forEach((e, i) => { const on = t >= 24 && t < 28; e.style.display = on ? 'block' : 'none'; if (on) { const p = outBack(prog(24.45 + i * .07, 24.8 + i * .07, t)); e.style.opacity = clamp(p) * (1 - ss(27.8, 27.95, t)); e.style.transform = `translateY(${(1 - p) * 26}px)`; } });
  const endOn = t >= 30.45; endEl.style.display = endOn ? 'block' : 'none';
  if (endOn) {
    const a = outBack(prog(30.45, 30.9, t)); eLogo.style.opacity = clamp(a); eLogo.style.transform = `scale(${lerp(.9, 1, a)})`;
    const b = outCubic(prog(30.8, 31.25, t)); eTag.style.opacity = b; eTag.style.transform = `translateY(${(1 - b) * 14}px)`;
    eWhen.style.opacity = outCubic(prog(31.1, 31.5, t));
  }
  ui.style.opacity = 1 - ss(33.4, 33.85, t);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}
window.renderAt = renderAt;
await renderAt(0);
window.DURATION = 34;
window.READY = true;

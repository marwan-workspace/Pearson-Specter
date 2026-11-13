import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sections = [...document.querySelectorAll('section[data-stage]')];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  loaderEl.textContent = 'Your browser could not start WebGL, so the 3D models are not shown.';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);

// ambient occlusion in the creases is most of what separates "rendered" from "toy"
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
composer.addPass(ao);
composer.addPass(new OutputPass());

// fine woven / cast-metal surface grain, faded out with distance so it never shimmers
function grain(mat, scale, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrainP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrainP;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 q = vGrainP * ${scale.toFixed(1)};
          vec3 w = vec3(sin(q.y) * cos(q.z), sin(q.z) * cos(q.x), sin(q.x) * cos(q.y));
          normal = normalize(normal + ${amount.toFixed(3)} * (1.0 - smoothstep(0.4, 1.4, length(fwidth(q)))) * w); }`);
  };
  mat.customProgramCacheKey = () => `grain${scale}_${amount}`;
  return mat;
}
// one shadow-casting light aimed at a stage
function keyLight(root, color, intensity, dir, reach, centerY) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dir).normalize().multiplyScalar(reach * 4).y += centerY;
  l.target.position.set(0, centerY, 0);
  l.castShadow = true;
  l.shadow.mapSize.set(2048, 2048);
  Object.assign(l.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: reach * 0.5, far: reach * 9 });
  l.shadow.bias = -0.0004; l.shadow.normalBias = reach * 0.012;
  root.add(l, l.target);
  return l;
}
const shadows = (o) => o.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- device screen (shared live canvas texture) ----------
const scr = document.createElement('canvas');
scr.width = 1024; scr.height = 640;
const sx = scr.getContext('2d');
const screenTex = new THREE.CanvasTexture(scr);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ecg = (u) => { // one heartbeat, u in 0..1
  const bump = (c, w, h) => h * Math.exp(-((u - c) ** 2) / w);
  return bump(0.18, 0.002, 0.12) - bump(0.36, 0.0003, 0.2) + bump(0.4, 0.0004, 1) - bump(0.44, 0.0004, 0.3) + bump(0.68, 0.005, 0.22);
};
function drawScreen(t, loaded) {
  const G = '#7dffa6', D = '#1f6b3c', mono = 'Consolas, monospace';
  sx.fillStyle = '#020d07'; sx.fillRect(0, 0, 1024, 640);
  sx.fillStyle = G; sx.strokeStyle = G; sx.textBaseline = 'top'; sx.textAlign = 'left';
  sx.font = `600 34px ${mono}`;
  sx.fillText('VITALS', 36, 28);
  sx.fillStyle = D; sx.fillText('DOSE   LINK', 200, 28);
  sx.textAlign = 'right'; sx.fillText('VITACUFF', 988, 28); sx.textAlign = 'left';
  sx.fillRect(36, 82, 952, 3);
  const hr = Math.round(72 + 3 * Math.sin(t * 0.4) + Math.sin(t * 1.7));
  sx.fillStyle = G; sx.font = `700 150px ${mono}`;
  sx.fillText(String(hr), 36, 100);
  sx.font = `600 36px ${mono}`;
  sx.fillText('BPM', 290, 192);
  sx.fillText('SpO2  98%', 660, 112); sx.fillText('TEMP  36.7 C', 660, 162); sx.fillText('BP    118/76', 660, 212);
  sx.lineWidth = 5; sx.lineJoin = 'round'; sx.beginPath();
  for (let x = 0; x <= 952; x += 4) {
    const y = 400 - 100 * ecg((x / 300 + t * 1.2) % 1);
    x ? sx.lineTo(36 + x, y) : sx.moveTo(36 + x, y);
  }
  sx.stroke();
  sx.fillRect(36, 484, 952, 3);
  const left = Math.max(0, 761 - Math.floor(t) % 762), mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  sx.fillText(loaded ? `NEXT DOSE 00:${mm}:${ss}` : 'LOAD SYRINGES', 36, 520);
  for (let i = 0; i < 3; i++) {
    sx.lineWidth = 4; sx.strokeRect(640 + i * 84, 512, 64, 48);
    if (i < loaded) sx.fillRect(650 + i * 84, 522, 44, 28);
  }
  sx.fillText(`${loaded}/3`, 900, 520);
  screenTex.needsUpdate = true;
}

// ---------- NASA insignia as a crisp texture ----------
const logoTex = new THREE.Texture();
logoTex.colorSpace = THREE.SRGBColorSpace;
const logoImg = new Image();
logoImg.onload = () => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 856;
  c.getContext('2d').drawImage(logoImg, 0, 0, 1024, 856);
  logoTex.image = c; logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); logoTex.needsUpdate = true;
};
logoImg.src = 'assets/nasa-logo.svg';

// ---------- 2K procedural surfaces: worn metal, woven strap, scratched glass ----------
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const rnd = (a, b) => a + Math.random() * (b - a);
function canvasPair(w, h) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const a = mk(), b = mk();
  return [a, a.getContext('2d'), b, b.getContext('2d')];
}
function speckle(ctx, w, h, amt) {
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  ctx.putImageData(d, 0, 0);
}
// base: metal colour; rust: 0..1 how corroded. Returns a material with colour, roughness and bump maps.
function wornMetal(base, rust) {
  const S = 2048, [cc, c, rc, r] = canvasPair(S, S);
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  r.fillStyle = '#6a6a6a'; r.fillRect(0, 0, S, S);
  speckle(c, S, S, 14); speckle(r, S, S, 30);
  // grime and corrosion gather toward the edges
  for (let i = 0; i < 90 + rust * 500; i++) {
    const edge = Math.random() < 0.7, x = edge ? (Math.random() < 0.5 ? rnd(0, S * 0.12) : rnd(S * 0.88, S)) : rnd(0, S), y = rnd(0, S), rad = rnd(8, 60 + rust * 90);
    const [px, py] = Math.random() < 0.5 ? [x, y] : [y, x];
    const g = c.createRadialGradient(px, py, 0, px, py, rad);
    const brown = Math.random() < rust;
    g.addColorStop(0, brown ? `rgba(${rnd(95, 135) | 0},${rnd(50, 70) | 0},25,${rnd(0.25, 0.6)})` : `rgba(8,8,9,${rnd(0.15, 0.4)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    const g2 = r.createRadialGradient(px, py, 0, px, py, rad);
    g2.addColorStop(0, 'rgba(235,235,235,.7)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = g2; r.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  // scratches: bright bare metal, slightly shinier
  for (let i = 0; i < 1400; i++) {
    const x = rnd(0, S), y = rnd(0, S), a = rnd(0, Math.PI), len = rnd(6, 140) * (Math.random() < 0.08 ? 3 : 1);
    for (const [ctx, col] of [[c, `rgba(205,210,215,${rnd(0.08, 0.45)})`], [r, `rgba(40,40,40,${rnd(0.2, 0.6)})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = rnd(0.6, 2.2);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
  }
  // worn-through paint along the borders
  c.strokeStyle = 'rgba(175,180,185,.28)'; c.lineWidth = 10; c.strokeRect(3, 3, S - 6, S - 6);
  const map = new THREE.CanvasTexture(cc), rough = new THREE.CanvasTexture(rc);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = rough.anisotropy = maxAniso;
  return grain(new THREE.MeshStandardMaterial({ map, roughnessMap: rough, bumpMap: rough, bumpScale: 0.6, metalness: 0.7 - rust * 0.3, roughness: 0.95, envMapIntensity: 3 }), 9000, 0.08);
}
function wovenStrap() {
  const W = 1024, H = 512, [cc, c, bc, b] = canvasPair(W, H);
  c.fillStyle = '#3b414d'; c.fillRect(0, 0, W, H);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  for (let i = -H; i < W + H; i += 9) { // twill diagonals
    for (const [ctx, lo, hi] of [[c, 'rgba(12,14,20,.55)', 'rgba(120,130,150,.22)'], [b, 'rgba(0,0,0,.7)', 'rgba(255,255,255,.7)']]) {
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = lo; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
      ctx.strokeStyle = hi; ctx.beginPath(); ctx.moveTo(i + 4.5, 0); ctx.lineTo(i + 4.5 + H, H); ctx.stroke();
    }
  }
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(200,205,215,${rnd(0.03, 0.2)})`; c.fillRect(rnd(0, W), rnd(0, H), rnd(1, 3), rnd(1, 9)); } // loose fibres
  speckle(c, W, H, 18);
  for (const y of [44, H - 44]) { // stitched hems
    for (const [ctx, col] of [[c, 'rgba(205,205,195,.9)'], [b, '#ffffff']]) {
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.setLineDash([18, 12]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  const map = new THREE.CanvasTexture(cc), bump = new THREE.CanvasTexture(bc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bump]) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.anisotropy = maxAniso; }
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, roughness: 0.97, side: THREE.DoubleSide });
}
function glassScratches() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1280;
  const g = c.getContext('2d');
  for (let i = 0; i < 520; i++) {
    const x = rnd(0, 2048), y = rnd(0, 1280), a = rnd(-0.5, 0.5) + (Math.random() < 0.3 ? 1.2 : 0), len = rnd(20, 420);
    g.strokeStyle = `rgba(225,232,240,${rnd(0.03, 0.2)})`; g.lineWidth = rnd(0.6, 2.4);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 22; i++) { // smudges
    const x = rnd(0, 2048), y = rnd(0, 1280), rad = rnd(60, 260), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(210,220,230,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
}
function icon(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = '#c9ccd0'; g.lineWidth = 11; g.lineCap = g.lineJoin = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
}
const ICONS = [
  icon((g) => { g.beginPath(); g.arc(64, 64, 22, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(64 + 30 * Math.cos(a), 64 + 30 * Math.sin(a)); g.lineTo(64 + 42 * Math.cos(a), 64 + 42 * Math.sin(a)); g.stroke(); } }),
  icon((g) => { g.beginPath(); g.moveTo(30, 48); g.lineTo(64, 82); g.lineTo(98, 48); g.stroke(); }),
  icon((g) => { g.beginPath(); g.moveTo(30, 80); g.lineTo(64, 46); g.lineTo(98, 80); g.stroke(); }),
  icon((g) => { g.beginPath(); g.arc(64, 64, 32, 0, 7); g.stroke(); }),
];

// ---------- the wrist device ----------
const M = {
  body: wornMetal('#4b4e53', 0.06),   // gunmetal slab
  cradle: wornMetal('#55524c', 0.3), // older, corroded carrier frame
  strap: wovenStrap(),
  steel: new THREE.MeshStandardMaterial({ color: 0x5d6065, metalness: 0.95, roughness: 0.42 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xa8742e, metalness: 1, roughness: 0.32 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.62, metalness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.08, metalness: 0.4, clearcoat: 1 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1 }),
  syringe: new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.25, clearcoat: 0.6 }),
  screen: new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  scratches: glassScratches(),
  logo: new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }),
  port: new THREE.MeshStandardMaterial({ color: 0x0c2a33, emissive: 0x35e0ff, emissiveIntensity: 1.6 }),
};
const CAPSULE_COLORS = [0xffb347, 0x5ad1ff, 0xff6b7a];

// Local frame: X runs along the forearm (hand at -X), +Y points out of the wrist, R is the arm radius the straps close around.
// Text on the screen reads left-to-right along +X, so the controls sit to its left like the reference.
function createDevice(R) {
  const g = new THREE.Group(), base = R + 0.002;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const band = (r, len) => new THREE.CylinderGeometry(r, r, len, 96, 1, true).rotateZ(Math.PI / 2);

  // two woven straps with steel keepers, joined under the wrist
  for (const x of [-0.048, 0.048]) {
    add(band(R + 0.003, 0.032), M.strap, x);
    for (const z of [-1, 1]) {
      add(new RoundedBoxGeometry(0.035, 0.006, 0.0035, 3, 0.0012), M.steel, x, R * 0.15, z * (R + 0.0035));
      add(new RoundedBoxGeometry(0.035, 0.007, 0.0035, 3, 0.001), M.rubber, x, -R * 0.35, z * (R * 0.94 + 0.003));
    }
  }
  add(new RoundedBoxGeometry(0.13, 0.005, 0.034, 3, 0.002), M.cradle, 0, -(R + 0.004), 0);

  // corroded carrier frame the slab locks into
  add(new THREE.BoxGeometry(0.184, 0.004, 0.106), M.cradle, 0, base + 0.002, 0);
  for (const z of [-1, 1]) {
    add(new RoundedBoxGeometry(0.192, 0.022, 0.008, 3, 0.0015), M.cradle, 0, base + 0.011, z * 0.0565);
    for (const x of [0.03, 0.038, 0.046]) add(new THREE.BoxGeometry(0.0032, 0.012, 0.0006), M.hole, x, base + 0.011, z * 0.0606); // milled slots
    for (const x of [-0.07, 0.075]) add(new THREE.BoxGeometry(0.012, 0.0012, 0.0006), M.hole, x, base + 0.015, z * 0.0606);
    const logo = add(new THREE.PlaneGeometry(0.02, 0.0167), M.logo, -0.02, base + 0.011, z * 0.0607);
    if (z < 0) logo.rotation.y = Math.PI;
    for (const x of [-0.048, 0.048]) add(new RoundedBoxGeometry(0.038, 0.012, 0.006, 3, 0.0015), M.cradle, x, base - 0.002, z * 0.0545); // strap lugs
  }

  // the slab: stepped gunmetal body, raised bezel, glass
  add(new RoundedBoxGeometry(0.18, 0.018, 0.105, 6, 0.004), M.body, 0, base + 0.013, 0);
  add(new RoundedBoxGeometry(0.174, 0.006, 0.099, 6, 0.0025), M.body, 0, base + 0.0235, 0);
  const top = base + 0.0265;
  add(new RoundedBoxGeometry(0.116, 0.003, 0.077, 4, 0.0012), M.body, 0.007, top, 0);   // screen surround
  add(new RoundedBoxGeometry(0.11, 0.003, 0.071, 4, 0.001), M.glass, 0.007, top + 0.0006, 0);
  add(flat(0.104, 0.065), M.screen, 0.007, top + 0.0022, 0);
  add(flat(0.11, 0.071), M.scratches, 0.007, top + 0.0024, 0);
  for (const [x, z] of [[-0.083, -0.045], [0.083, -0.045], [-0.083, 0.045], [0.083, 0.045]]) add(new THREE.CylinderGeometry(0.0016, 0.0016, 0.001, 12), M.steel, x, top + 0.0003, z);

  // controls to the left of the screen: four keys and a four-way pad
  [-0.039, -0.0255, -0.012, 0.0015].forEach((z, i) => {
    add(new RoundedBoxGeometry(0.0125, 0.004, 0.0112, 3, 0.0012), M.rubber, -0.069, top + 0.001, z);
    add(flat(0.0085, 0.0085), ICONS[i], -0.069, top + 0.0032, z);
  });
  add(new THREE.CylinderGeometry(0.0155, 0.0155, 0.0016, 48), M.hole, -0.069, top, 0.03);
  add(new THREE.TorusGeometry(0.0155, 0.0011, 10, 56).rotateX(Math.PI / 2), M.body, -0.069, top + 0.0008, 0.03);
  for (const [dx, dz, rot] of [[0.0075, 0, 0], [-0.0075, 0, 0], [0, 0.0075, 1], [0, -0.0075, 1]]) {
    const petal = add(new THREE.CapsuleGeometry(0.0027, 0.0052, 6, 16).rotateZ(Math.PI / 2), M.rubber, -0.069 + dx, top + 0.0016, 0.03 + dz);
    petal.rotation.y = rot * Math.PI / 2; petal.scale.y = 0.6;
  }

  // insignia and vents on the right of the bezel
  add(flat(0.019, 0.0159), M.logo, 0.075, top + 0.0008, -0.03);
  for (const z of [0.012, 0.02, 0.028, 0.036]) add(new THREE.BoxGeometry(0.014, 0.0006, 0.0028), M.hole, 0.075, top + 0.0003, z);

  // hand end: three brass syringe sockets and a data port
  add(new RoundedBoxGeometry(0.012, 0.03, 0.113, 3, 0.002), M.cradle, -0.094, base + 0.015, 0);
  const face = -0.1002, seat = face - 0.007, capsules = [], leds = [];
  [-0.034, -0.014, 0.006].forEach((z, i) => {
    add(new THREE.TorusGeometry(0.0064, 0.0013, 12, 40).rotateY(Math.PI / 2), M.brass, face, base + 0.013, z);
    add(new THREE.CircleGeometry(0.0064, 32).rotateY(-Math.PI / 2), M.hole, face - 0.0001, base + 0.013, z);
    // a prefilled syringe: needle end goes into the socket, plunger stays outside
    const syr = new THREE.Group(), xcyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 28).rotateZ(Math.PI / 2);
    const part = (geo, mat, x) => { const m = new THREE.Mesh(geo, mat); m.position.x = x; syr.add(m); };
    part(xcyl(0.0045, 0.026), new THREE.MeshPhysicalMaterial({ color: CAPSULE_COLORS[i], roughness: 0.06, clearcoat: 1, emissive: CAPSULE_COLORS[i], emissiveIntensity: 0.15 }), 0.013); // barrel full of medicine
    for (const x of [0.004, 0.008, 0.012]) part(xcyl(0.00462, 0.0005), M.rubber, x);                                             // dose marks
    part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.0014, 28).rotateZ(Math.PI / 2).scale(1, 1, 0.62), M.syringe, 0);          // finger flange
    part(xcyl(0.0016, 0.013), M.syringe, -0.0065);                                                                               // plunger rod
    part(xcyl(0.0058, 0.0016), M.syringe, -0.0135);                                                                              // thumb pad
    syr.position.set(seat, base + 0.013, z); g.add(syr);
    capsules.push(syr);
    leds.push(add(new THREE.SphereGeometry(0.0016, 12, 8), new THREE.MeshStandardMaterial({ color: 0x10301c, emissive: 0x7dffa6, emissiveIntensity: 0 }), face, base + 0.0245, z));
  });
  add(new THREE.BoxGeometry(0.0008, 0.009, 0.011), M.hole, face, base + 0.013, 0.036);
  add(new THREE.BoxGeometry(0.001, 0.011, 0.013), M.steel, face + 0.0003, base + 0.013, 0.036);

  // injector head: sits on the wrist crease just past the sockets, needle guide pressed onto the veins
  add(new RoundedBoxGeometry(0.024, 0.012, 0.046, 4, 0.003), M.body, -0.112, base + 0.001, -0.014);
  add(new THREE.BoxGeometry(0.0245, 0.0016, 0.03), M.port, -0.112, base + 0.003, -0.014);
  for (const z of [-0.026, -0.002]) add(new THREE.CylinderGeometry(0.0011, 0.0011, 0.012, 10).rotateZ(Math.PI / 2), M.steel, -0.105, base + 0.006, z); // feed lines from the sockets

  // p in 0..1: syringes slide into their sockets one after another
  g.userData.setLoad = (p) => {
    let n = 0;
    capsules.forEach((c, i) => {
      const t = THREE.MathUtils.smoothstep(p * 3.4 - i, 0, 1);
      c.position.x = seat - (1 - t) * 0.085;
      c.visible = p * 3.4 - i > -0.4;
      leds[i].material.emissiveIntensity = t >= 1 ? 3 : 0;
      if (t >= 1) n++;
    });
    return n;
  };
  g.userData.setLoad(1);
  g.userData.top = top; // height of the screen above the arm axis, for framing
  shadows(g);
  return g;
}

// ---------- stages ----------
const stages = {};
function makeStage(name, envIntensity) {
  const root = new THREE.Group(), spin = new THREE.Group();
  root.add(spin); root.visible = false; scene.add(root);
  return (stages[name] = { root, spin, yaw: 0, envIntensity, device: null });
}

// 1. the device on a bench
{
  const s = makeStage('device', 1);
  s.device = createDevice(0.04);
  s.spin.add(s.device);
  // silicone training arm (hand end is the thin end, at -X) with the wrist veins the injector sits on
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.043, 0.34, 64).rotateZ(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xa9836c, roughness: 0.62, sheen: 0.4, sheenColor: 0xffd9c4 }));
  arm.receiveShadow = true;
  s.spin.add(arm);
  const veinMat = new THREE.MeshStandardMaterial({ color: 0x45607f, roughness: 0.6 });
  for (const [z0, wob, ph] of [[-0.014, 0.004, 0], [0.006, 0.005, 2], [-0.004, 0.003, 4]]) {
    const pts = [];
    for (let x = -0.17; x <= 0.17; x += 0.01) {
      const r = 0.039 + 0.0235 * x - 0.0004, z = z0 + wob * Math.sin(x * 38 + ph);
      pts.push(new THREE.Vector3(x, Math.sqrt(r * r - z * z), z));
    }
    s.spin.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.0011, 8), veinMat));
  }
  keyLight(s.root, 0xfff1dc, 2.6, V3(0.5, 1, 0.6), 0.25, 0.03);
}

// 2. NASA crew suit. The device sits on the inner (palm-side) wrist of the left arm, where the veins are.
// wrist/dir/normal are in the fitted model's space (feet at y=0, 1.8 tall).
const SUITS = {
  cabin: { url: 'assets/aces.glb', turn: Math.PI, wrist: [0.31, 1.045, 0.04], dir: [0, 0.72, -0.69], normal: [0, 0.69, 0.72], R: 0.064 },
};
const manager = new THREE.LoadingManager(
  () => { loaderEl.hidden = true; },
  (url, done, total) => { loaderEl.textContent = `Loading 3D models… ${done} of ${total}`; },
  (url) => { loaderEl.hidden = false; loaderEl.textContent = `Could not load ${url}. Start the site with "node server.js" and reload.`; },
);
const gltf = new GLTFLoader(manager); // NASA's files are Draco-compressed
gltf.setDRACOLoader(new DRACOLoader(manager).setDecoderPath('vendor/three/addons/libs/draco/gltf/'));
function addSuit(stage, cfg) {
  const d = (stage.device = createDevice(cfg.R));
  const x = new THREE.Vector3(...cfg.dir).normalize();
  const z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(...cfg.normal)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  d.position.set(...cfg.wrist);
  stage.spin.add(d);
  gltf.load(cfg.url, ({ scene: model }) => {
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), k = 1.8 / size.y;
    const fit = new THREE.Group();
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    fit.add(model); fit.scale.setScalar(k); fit.rotation.y = cfg.turn;
    fit.updateMatrixWorld(true);
    // The files ship flat, glass-like materials. Rebuild them as cloth, with a mirrored visor on the helmet.
    const swapped = new Map(), hsl = {}, c = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!swapped.has(m)) {
        m.color.getHSL(hsl);
        new THREE.Box3().setFromObject(o).getCenter(c);
        const onHead = c.y > 1.45, golden = hsl.s > 0.25 && hsl.h > 0.08 && hsl.h < 0.17;
        let nm;
        if (onHead && (golden || hsl.l < 0.05)) {
          nm = new THREE.MeshPhysicalMaterial({ color: golden ? 0xc9983a : 0x0b0c10, metalness: 1, roughness: 0.07, clearcoat: 1, envMapIntensity: 2.5 });
        } else {
          const color = m.color.clone();
          if (hsl.s > 0.5 && hsl.h < 0.09 && hsl.l > 0.4) color.set(0xc24a14); // true international orange, not peach
          nm = grain(new THREE.MeshPhysicalMaterial({ color, map: m.map, roughness: 0.92, metalness: 0, sheen: 0.25, sheenRoughness: 0.6, sheenColor: color }), 1500 / k, 0.28);
        }
        nm.name = m.name;
        swapped.set(m, nm);
      }
      o.material = swapped.get(m);
    });
    shadows(model);
    stage.spin.add(fit);
    stage.fit = fit;
    // Seat the unit on the real suit surface: probe the sleeve under its footprint and clear the highest point.
    const rc = new THREE.Raycaster(), o = new THREE.Vector3(), down = y.clone().negate();
    rc.far = 0.2;
    let high = 0;
    for (let u = -0.11; u <= 0.0901; u += 0.025) for (let v = -0.05; v <= 0.0501; v += 0.025) {
      o.set(...cfg.wrist).addScaledVector(x, u).addScaledVector(z, v).addScaledVector(y, 0.2);
      rc.set(o, down);
      const hit = rc.intersectObject(fit, true)[0];
      if (hit && 0.2 - hit.distance < 0.14) high = Math.max(high, 0.2 - hit.distance);
    }
    if (high > 0) {
      const seated = createDevice(high + 0.002);
      seated.position.copy(d.position); seated.quaternion.copy(d.quaternion);
      stage.spin.remove(d); stage.spin.add(seated); stage.device = seated;
    }
  });
}

{
  const s = makeStage('cabin', 0.35);
  addSuit(s, SUITS.cabin);
  // crew-module interior: padded off-white wall panels with soft seams, lit from overhead strips
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const p = c.getContext('2d');
  p.fillStyle = '#aeaba3'; p.fillRect(0, 0, 1024, 1024);
  const px = p.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < px.data.length; i += 4) { const n = (Math.random() - 0.5) * 22; px.data[i] += n; px.data[i + 1] += n; px.data[i + 2] += n; }
  p.putImageData(px, 0, 0);
  for (let i = 0; i <= 1024; i += 256) {
    const g1 = p.createLinearGradient(i - 10, 0, i + 10, 0);
    g1.addColorStop(0, 'rgba(0,0,0,0)'); g1.addColorStop(0.5, 'rgba(20,20,24,.3)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = g1; p.fillRect(i - 10, 0, 20, 1024);
    const g2 = p.createLinearGradient(0, i - 10, 0, i + 10);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, 'rgba(20,20,24,.3)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = g2; p.fillRect(0, i - 10, 1024, 20);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 1); tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const room = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.5, 26), new THREE.MeshStandardMaterial({ map: tex, color: 0x77756f, side: THREE.BackSide, roughness: 0.9 }));
  room.position.y = 1.2; room.receiveShadow = true; s.root.add(room);
  for (const x of [-1.2, 1.2]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 24), new THREE.MeshBasicMaterial({ color: 0xfff3dd }));
    strip.position.set(x, 2.43, 0); s.root.add(strip);
  }
  s.root.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a3630, 0.35));
  keyLight(s.root, 0xfff0d8, 1.7, V3(0.5, 1, 0.7), 1.6, 0.9);
}

// ---------- camera shots, driven by scroll ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmp = V(), tmpN = V(), tmpZ = V();
const deviceShots = [
  { a: V(0.3, 0.27, 0.42), b: V(0.14, 0.32, 0.42), look: V(0, 0.05, 0) },           // hero
  { a: V(0.007, 0.46, 0.2), b: V(0.007, 0.33, 0.1), look: V(0.007, 0.07, 0) },      // read the screen
  { a: V(-0.44, 0.2, 0.2), b: V(-0.32, 0.13, 0.13), look: V(-0.115, 0.05, -0.012) }, // syringe sockets and injector at the hand end
];
function shot(i, p, out) {
  out.up.set(0, 1, 0);
  const sec = sections[i], stage = stages[sec.dataset.stage];
  if (sec.dataset.stage === 'device') {
    const s = deviceShots[i];
    out.pos.lerpVectors(s.a, s.b, p); out.look.copy(s.look);
    return;
  }
  // astronauts: whole figure first, then push in on the wrist from where the wearer would read it
  const t = THREE.MathUtils.smoothstep(p, 0.12, 0.7), mw = stage.device.matrixWorld;
  stage.device.getWorldPosition(tmp);
  tmpN.set(0, 1, 0).transformDirection(mw);
  tmpZ.set(0, 0, 1).transformDirection(mw);
  tmp.addScaledVector(tmpN, stage.device.userData.top); // aim at the screen, not the arm inside it
  out.look.set(0, 0.95, 0).lerp(tmp, t);
  out.pos.set(0, 1.05, 4.4).lerp(tmp.addScaledVector(tmpN, 0.4).addScaledVector(tmpZ, 0.13), t);
  out.up.lerp(tmpZ.negate(), t).normalize(); // roll so the screen text ends up level
}

let active = -1, shown = null, fadeTimer = 0;
const cur = { pos: V(), look: V(), up: V(0, 1, 0) }, want = { pos: V(), look: V(), up: V(0, 1, 0) };
let shiftX = 0, shiftY = 0, progress = 0;

function readScroll() {
  const mid = scrollY + innerHeight / 2;
  let i = sections.findIndex((s) => mid < s.offsetTop + s.offsetHeight);
  if (i < 0) i = sections.length - 1;
  // progress runs while the section is pinned: from its top reaching the top of the screen to its end
  const s = sections[i];
  progress = THREE.MathUtils.clamp((scrollY - s.offsetTop) / Math.max(1, s.offsetHeight - innerHeight), 0, 1);
  if (i !== active) {
    active = i;
    const name = s.dataset.stage;
    clearTimeout(fadeTimer); // a pending cut is always superseded, so the canvas can never stay faded out
    const swap = () => { if (name !== shown) showStage(name); canvas.style.opacity = 1; };
    if (name === shown || shown === null || calm) swap(); else { canvas.style.opacity = 0; fadeTimer = setTimeout(swap, 190); }
  }
}
function showStage(name) {
  shown = name;
  for (const k in stages) stages[k].root.visible = k === name;
  scene.environmentIntensity = stages[name].envIntensity;
  scene.background = new THREE.Color(name === 'cabin' ? 0x0b0c0f : 0x0a1230);
  scene.fog = name === 'cabin' ? new THREE.Fog(0x0b0c0f, 4, 15) : null; // the module falls away into dimness
  ao.updateGtaoMaterial({ radius: name === 'device' ? 0.02 : 0.22, distanceExponent: 1.4, thickness: 1.2, samples: 16 });
  snap = true;
}
let snap = true;

function resize() {
  if (!innerWidth || !innerHeight) return; // opened in a hidden or zero-size tab: wait for the real size, or the camera maths goes NaN for good
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  readScroll();
}
addEventListener('resize', resize);
addEventListener('scroll', readScroll, { passive: true });

// drag sideways to turn the model (vertical touch drags still scroll the page)
canvas.style.touchAction = 'pan-y';
canvas.style.cursor = 'grab';
let dragX = null;
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', (e) => { if (dragX !== null && shown) { stages[shown].yaw += (e.clientX - dragX) * 0.008; dragX = e.clientX; } });
const endDrag = () => { dragX = null; canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

let last = performance.now(), t = 0;
let lastScreen = -1;
function frame() {
  requestAnimationFrame(frame);
  if (!shown) return;
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  const sec = sections[active], stage = stages[shown];

  // idle motion
  const idle = calm ? 0 : 1;
  stage.spin.rotation.y = stage.yaw + (shown === 'device' ? idle * 0.18 * Math.sin(t * 0.5) : 0);
  stage.root.updateMatrixWorld();

  // capsules load only in the section about them; everywhere else the bay is full
  const loaded = stage.device.userData.setLoad(sec.hasAttribute('data-capsules') ? progress * 1.15 : 1);
  if (t - lastScreen > (calm ? 1 : 0.066)) { drawScreen(calm ? 0 : t, loaded); lastScreen = t; }

  shot(active, progress, want);
  // narrower screens leave less room beside the text, so stand further back
  want.pos.sub(want.look).multiplyScalar(THREE.MathUtils.clamp(1.9 / camera.aspect, 1, 2.6)).add(want.look);
  const k = snap || calm ? 1 : 1 - Math.exp(-dt * 4.5);
  cur.pos.lerp(want.pos, k); cur.look.lerp(want.look, k); cur.up.lerp(want.up, k);
  camera.position.copy(cur.pos); camera.up.copy(cur.up).normalize(); camera.lookAt(cur.look);

  // keep the model clear of the text: beside it on wide screens, above it on phones
  const wide = innerWidth > 900, side = sec.dataset.side === 'left' ? -1 : 1;
  const wx = wide ? side * 0.22 * innerWidth : 0, wy = wide ? 0 : 0.17 * innerHeight;
  shiftX += (wx - shiftX) * k; shiftY += (wy - shiftY) * k;
  camera.setViewOffset(innerWidth, innerHeight, shiftX, shiftY, innerWidth, innerHeight);
  snap = false;

  composer.render();
}

resize();
frame();
window.__vitacuff = { THREE, scene, camera, stages, SUITS }; // handy in the console

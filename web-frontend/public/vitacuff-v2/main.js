import * as THREE from 'three';
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
// Laid out like the reference OLED: amber header, vitals column, ECG window, one card per syringe.
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
const MONO = 'Consolas, "Courier New", monospace', SANS = '"Segoe UI", Arial, sans-serif';
const SYRINGES = [
  { code: 'SYR-01', name: 'Adenosine + Lidocaine', hex: '#10b981', color: 0x10b981 },
  { code: 'SYR-02', name: 'Epinephrine + Norepi', hex: '#f59e0b', color: 0xf59e0b },
  { code: 'SYR-03', name: 'Ketorolac Analgesic', hex: '#e2e8f0', color: 0xe2e8f0 },
];
function drawScreen(t, loaded) {
  const W = 1024, ok = loaded === 3, status = ok ? '#10b981' : '#f59e0b';
  sx.textBaseline = 'alphabetic'; sx.textAlign = 'left'; sx.setLineDash([]);
  sx.fillStyle = '#05070b'; sx.fillRect(0, 0, W, 640);
  // header
  sx.fillStyle = 'rgba(245,158,11,0.13)'; sx.fillRect(24, 18, W - 48, 50);
  sx.strokeStyle = 'rgba(245,158,11,0.6)'; sx.lineWidth = 2; sx.strokeRect(24, 18, W - 48, 50);
  sx.fillStyle = '#f59e0b'; sx.font = `700 22px ${MONO}`; sx.fillText('VITACUFF  //  CLOSED-LOOP WRIST UNIT', 42, 51);
  sx.fillStyle = status; sx.textAlign = 'right'; sx.fillText(ok ? '● NOMINAL' : '● LOAD SYRINGES', W - 42, 51); sx.textAlign = 'left';
  // vitals column
  const hr = Math.round(72 + 3 * Math.sin(t * 0.4) + Math.sin(t * 1.7));
  sx.fillStyle = '#a1a1aa'; sx.font = `600 17px ${SANS}`; sx.fillText('HEART RATE & SpO2', 36, 104);
  sx.fillStyle = '#f4f4f5'; sx.font = `700 84px ${MONO}`; sx.fillText(String(hr), 32, 182);
  const hw = sx.measureText(String(hr)).width;
  sx.fillStyle = '#10b981'; sx.font = `700 20px ${MONO}`; sx.fillText('BPM', 40 + hw, 182);
  sx.fillStyle = '#f4f4f5'; sx.font = `700 52px ${MONO}`; sx.fillText('98%', 214, 182);
  sx.fillStyle = 'rgba(255,255,255,0.05)'; sx.fillRect(34, 204, 300, 140);
  sx.strokeStyle = 'rgba(255,255,255,0.14)'; sx.lineWidth = 1.5; sx.strokeRect(34, 204, 300, 140);
  sx.fillStyle = '#f59e0b'; sx.font = `700 16px ${MONO}`; sx.fillText('VITALS', 50, 232);
  sx.fillStyle = '#e2e8f0'; sx.font = `18px ${MONO}`;
  sx.fillText('TEMP  : 36.7 °C', 50, 266); sx.fillText('BP    : 118/76 mmHg', 50, 296); sx.fillText('RESP  : 14 /min', 50, 326);
  // ECG window
  const bx = 354, by = 86, bw = 636, bh = 258;
  sx.fillStyle = '#080a0f'; sx.fillRect(bx, by, bw, bh);
  sx.strokeStyle = 'rgba(255,255,255,0.15)'; sx.strokeRect(bx, by, bw, bh);
  sx.strokeStyle = 'rgba(255,255,255,0.05)'; sx.lineWidth = 1;
  for (let x = bx + 53; x < bx + bw; x += 53) { sx.beginPath(); sx.moveTo(x, by); sx.lineTo(x, by + bh); sx.stroke(); }
  for (let y = by + 43; y < by + bh; y += 43) { sx.beginPath(); sx.moveTo(bx, y); sx.lineTo(bx + bw, y); sx.stroke(); }
  sx.fillStyle = '#a1a1aa'; sx.font = `600 14px ${MONO}`; sx.fillText('ECG  LEAD II', bx + 14, by + 24);
  sx.strokeStyle = '#10b981'; sx.lineWidth = 3.5; sx.lineJoin = 'round'; sx.beginPath();
  for (let x = 0; x <= bw - 8; x += 3) {
    const y = by + bh * 0.66 - bh * 0.42 * ecg((x / 212 + t * 1.2) % 1);
    x ? sx.lineTo(bx + 4 + x, y) : sx.moveTo(bx + 4 + x, y);
  }
  sx.stroke();
  // one card per syringe
  const cw = (W - 68 - 30) / 3;
  SYRINGES.forEach((s, i) => {
    const cx = 34 + i * (cw + 15), cy = 366, ch = 196, full = i < loaded;
    sx.fillStyle = full ? 'rgba(18,21,30,0.95)' : 'rgba(10,12,16,0.95)'; sx.fillRect(cx, cy, cw, ch);
    sx.strokeStyle = full ? s.hex : 'rgba(255,255,255,0.18)'; sx.lineWidth = full ? 2.5 : 1.5;
    if (!full) sx.setLineDash([8, 6]);
    sx.strokeRect(cx, cy, cw, ch); sx.setLineDash([]);
    sx.fillStyle = full ? s.hex : '#52525b'; sx.font = `700 18px ${MONO}`; sx.fillText(`${s.code}  ${full ? '2.00' : '0.00'} mL`, cx + 16, cy + 36);
    sx.fillStyle = full ? '#f4f4f5' : '#71717a'; sx.font = `600 17px ${SANS}`; sx.fillText(s.name, cx + 16, cy + 66);
    sx.fillStyle = full ? '#a1a1aa' : '#f59e0b'; sx.font = `700 14px ${MONO}`; sx.fillText(full ? 'CHECK-VALVE SEALED' : 'EMPTY  -  INSERT', cx + 16, cy + 96);
    sx.strokeStyle = '#71717a'; sx.lineWidth = 1.5; sx.strokeRect(cx + 16, cy + 120, cw - 32, 26);
    if (full) { sx.fillStyle = s.hex; sx.fillRect(cx + 18, cy + 122, cw - 36, 22); }
    sx.fillStyle = '#71717a'; sx.font = `600 13px ${MONO}`; sx.fillText(full ? 'BOLUS READY' : 'AWAITING ACCESS CARD', cx + 16, cy + 176);
  });
  // footer: next dose and how many are loaded
  const left = Math.max(0, 761 - Math.floor(t) % 762), mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  sx.fillStyle = '#f59e0b'; sx.font = `700 22px ${MONO}`; sx.fillText(ok ? `NEXT DOSE  00:${mm}:${ss}` : 'LOAD SYRINGES', 36, 612);
  sx.fillStyle = status; sx.textAlign = 'right'; sx.fillText(`${loaded}/3 LOADED`, W - 36, 612); sx.textAlign = 'left';
  screenTex.needsUpdate = true;
}

// ---------- the wrist device ----------
// A forged-carbon unit with a curved display, strapped to the wrist by two kevlar straps with titanium edges,
// gold end trim, a hazard-amber manual pull-ring, and a bay of three prefilled syringes on the near side.
// Its size is fixed; only the straps follow the arm, so it keeps its proportions on any wrist.
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const carbonTex = canvasTex(1024, 1024, (g) => { // forged carbon: chopped strands at random angles
  g.fillStyle = '#121419'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    g.save(); g.translate(Math.random() * 1024, Math.random() * 1024); g.rotate(Math.random() * Math.PI);
    const v = 20 + Math.floor(Math.random() * 46);
    g.fillStyle = `rgb(${v},${v + 3},${v + 7})`; g.fillRect(-26, -6, 52, 12); g.restore();
  }
}, [22, 22]); // extrude UVs are in metres
const kevlarTex = canvasTex(256, 256, (g) => { // basket-weave kevlar
  g.fillStyle = '#0c0e13'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) { g.fillStyle = ((x + y) / 8) % 2 === 0 ? '#1b1f2a' : '#11141b'; g.fillRect(x, y, 7, 7); }
}, [6, 8]);

const M = {
  kevlar: new THREE.MeshStandardMaterial({ map: kevlarTex, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }),
  carbon: new THREE.MeshPhysicalMaterial({ map: carbonTex, roughness: 0.42, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
  titanium: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.25, metalness: 0.95 }),
  darkTi: new THREE.MeshStandardMaterial({ color: 0x1e222d, roughness: 0.32, metalness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.1, metalness: 0.98 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xf5b40b, emissive: 0xf59e0b, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.05, clearcoat: 1, depthWrite: false }),
  stopper: new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.7 }),
  manifold: new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.34, roughness: 0.08, clearcoat: 1, depthWrite: false }),
  trap: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.9, transparent: true, opacity: 0.78 }),
  // the display wins every depth tie with the shell under it, so it can never stripe
  screen: new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  cover: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.04, clearcoat: 1, depthWrite: false }),
};

// Annular sector around the X axis (angles from +Y toward +Z), extruded along X: shells with real thickness.
function arcSlab(r1, r2, a0, a1, len, bevel = 0, n = 192) {
  const s = new THREE.Shape(), pt = (r, a) => [-r * Math.sin(a), r * Math.cos(a)];
  s.moveTo(...pt(r2, a0));
  for (let i = 1; i <= n; i++) s.lineTo(...pt(r2, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) s.lineTo(...pt(r1, a0 + ((a1 - a0) * i) / n));
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 1 });
  return geo.translate(0, 0, -len / 2).rotateY(Math.PI / 2);
}
// Curved display surface, finely tessellated: u runs along +X, text "up" points to -Z (as the camera shots expect).
function arcPatch(r, a0, a1, len, nx = 24, na = 160) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= na; j++) {
    const a = a0 + ((a1 - a0) * j) / na;
    for (let i = 0; i <= nx; i++) { pos.push(-len / 2 + (len * i) / nx, r * Math.cos(a), r * Math.sin(a)); uv.push(i / nx, 1 - j / na); }
  }
  for (let j = 0; j < na; j++) for (let i = 0; i < nx; i++) { const p = j * (nx + 1) + i, q = p + nx + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
const xcyl = (r1, r2, len, seg = 32) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateZ(-Math.PI / 2); // along X

// A padded sleeve with rounded ends: a rounded-rectangle cross-section revolved around the X axis.
function paddedSleeve(r1, r2, len, round) {
  const pts = [], hl = len / 2;
  for (const [cr, cy, a0] of [[r2 - round, hl - round, 0], [r1 + round, hl - round, Math.PI / 2], [r1 + round, -hl + round, Math.PI], [r2 - round, -hl + round, 1.5 * Math.PI]]) {
    for (let i = 0; i <= 10; i++) { const a = a0 + (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(cr + round * Math.cos(a), cy + round * Math.sin(a))); }
  }
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, 192).rotateZ(Math.PI / 2);
}

// The device is built once at a reference arm radius and scaled evenly to the arm it sits on,
// so it looks the same on the training arm and on the suit.
const R0 = 0.045;

// Local frame: X runs along the forearm (hand at -X), +Y points out of the wrist, R is the arm radius the sleeve closes around.
// Text on the screen reads left-to-right along +X.
function createDevice(R) {
  const g = new THREE.Group();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // bulky padded kevlar sleeve (9 mm thick) with titanium compression rings near both ends
  const SL = 0.2, sIn = R0 + 0.0015, sOut = R0 + 0.0105;
  add(g, paddedSleeve(sIn, sOut, SL, 0.004), M.kevlar);
  for (const x of [-1, 1]) for (const d of [0.012, 0.02]) add(g, new THREE.TorusGeometry(sOut - 0.0002, 0.0017, 14, 192).rotateY(Math.PI / 2), M.titanium, x * (SL / 2 - d));

  // forged-carbon dorsal unit on top of the sleeve: gold end trim, titanium edge rails, curved display
  const LEN = 0.15, base = sOut - 0.0012, outer = base + 0.0085, half = 0.046 / base, BEVEL = 0.0016, skin = outer + BEVEL;
  add(g, arcSlab(base, outer, -half, half, LEN - 2 * BEVEL, BEVEL), M.carbon);
  for (const x of [-1, 1]) add(g, arcSlab(skin - 0.0004, skin + 0.0011, -half + 0.03, half - 0.03, 0.0032), M.gold, x * (LEN / 2 - 0.006));
  for (const s of [-1, 1]) add(g, arcSlab(skin - 0.0006, skin + 0.0008, s * (half - 0.03), s * (half - 0.018), LEN - 0.022), M.titanium);
  const rs = skin + 0.0005, dLen = 0.112, dHalf = 0.035 / rs;
  add(g, arcPatch(rs, -dHalf, dHalf, dLen), M.screen, -0.004);
  add(g, arcPatch(rs + 0.0007, -dHalf - 0.004, dHalf + 0.004, dLen + 0.004, 8, 120), M.cover, -0.004);

  // far side: carbon pod carrying the hazard-amber mechanical pull-ring override
  const pa = -(half + 0.36);
  add(g, arcSlab(sOut - 0.0012, sOut + 0.006, pa - 0.24, pa + 0.24, 0.05, 0.0012), M.carbon, -0.02);
  const rig = new THREE.Group(); rig.rotation.x = pa; g.add(rig);
  const ry = sOut + 0.0072 + 0.004;
  add(rig, new THREE.BoxGeometry(0.032, 0.008, 0.02), M.amber, -0.02, ry);
  add(rig, new THREE.CylinderGeometry(0.0055, 0.0055, 0.0012, 32), M.darkTi, -0.02, ry + 0.0045);
  add(rig, new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, 16), M.steel, -0.02, ry + 0.006);
  add(rig, new THREE.TorusGeometry(0.0072, 0.0017, 16, 40).rotateX(Math.PI / 2), M.gold, -0.02, ry + 0.0105);
  add(rig, xcyl(0.0012, 0.0012, 0.0137, 12), M.gold, -0.02, ry + 0.0105);

  // near side: carbon pod built into the sleeve, carrying the syringe tray, toward the hand end where they are loaded
  const bc = half + 0.5;
  add(g, arcSlab(sOut - 0.0012, sOut + 0.006, bc - 0.42, bc + 0.42, 0.14, 0.0012), M.carbon, -0.02);
  const bay = new THREE.Group(); bay.rotation.x = bc; g.add(bay);
  const by = sOut + 0.0135, home = -0.045, units = [], rings = [], channels = [];
  add(bay, new THREE.BoxGeometry(0.125, 0.0016, 0.035), M.darkTi, -0.033, by - 0.0052);
  for (const z of [-0.0185, 0.0185]) add(bay, new THREE.BoxGeometry(0.125, 0.0035, 0.0016), M.gold, -0.033, by - 0.0035, z);
  SYRINGES.forEach((s, i) => {
    const z = (i - 1) * 0.0105, u = new THREE.Group();
    u.position.set(home, by, z); bay.add(u);
    add(u, xcyl(0.0042, 0.0042, 0.07), M.glass);                                                       // borosilicate barrel
    for (const x of [-0.018, -0.006, 0.006, 0.018]) add(u, xcyl(0.00432, 0.00432, 0.0004), M.stopper, x); // dose marks
    add(u, xcyl(0.0033, 0.0033, 0.06, 24), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.8, transparent: true, opacity: 0.92 }), 0.003); // drug
    const ring = add(u, xcyl(0.0054, 0.0054, 0.009), new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0xf59e0b, emissiveIntensity: 0.05, roughness: 0.25, metalness: 1 }), -0.016); // piezo drive ring
    add(u, xcyl(0.0034, 0.0034, 0.005, 24), M.stopper, -0.0285);                                       // stopper
    add(u, xcyl(0.0014, 0.0014, 0.058, 16), M.steel, -0.06);                                           // plunger rod
    add(u, xcyl(0.0045, 0.0045, 0.0018), M.steel, -0.0895);                                            // thumb pad
    add(u, xcyl(0.0018, 0.0032, 0.01, 20), new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: s.color, emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.5 }), 0.04); // ruby check-valve nozzle
    const curve = new THREE.CatmullRomCurve3([V3(0, by, z), V3(0.009, by, z * 0.65), V3(0.021, by - 0.0006, 0)]);
    channels.push(add(bay, new THREE.TubeGeometry(curve, 24, 0.0009, 10, false), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0, transparent: true, opacity: 0.85 })));
    units.push(u); rings.push(ring);
  });
  add(bay, new THREE.BoxGeometry(0.026, 0.011, 0.034), M.manifold, 0.012, by);
  add(bay, new THREE.CylinderGeometry(0.0045, 0.0045, 0.011, 32), M.trap, 0.021, by);
  add(bay, new THREE.CylinderGeometry(0.0053, 0.0053, 0.0022, 32), M.gold, 0.021, by + 0.0058);

  // p in 0..1: syringes slide into the bay one after another; a seated one lights its drive ring and channel
  g.userData.setLoad = (p) => {
    let n = 0;
    units.forEach((u, i) => {
      const t = THREE.MathUtils.smoothstep(p * 3.4 - i, 0, 1);
      u.position.x = home - (1 - t) * 0.085;
      u.visible = p * 3.4 - i > -0.4;
      rings[i].material.emissiveIntensity = t >= 1 ? 0.6 : 0.05;
      channels[i].material.emissiveIntensity = t >= 1 ? 0.75 : 0;
      if (t >= 1) n++;
    });
    return n;
  };
  g.userData.setLoad(1);
  const k = R / R0;
  g.scale.setScalar(k);
  g.userData.top = rs * k; // height of the screen above the arm axis, for framing
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

loaderEl.hidden = true; // every model is built in code, so there is nothing left to download

// ---------- camera shots, driven by scroll ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deviceShots = [
  { a: V(0.3, 0.27, 0.42), b: V(0.14, 0.32, 0.42), look: V(0, 0.05, 0) },           // hero
  { a: V(0.007, 0.46, 0.2), b: V(0.007, 0.33, 0.1), look: V(0.007, 0.07, 0) },      // read the screen
  { a: V(-0.44, 0.2, 0.2), b: V(-0.32, 0.13, 0.13), look: V(-0.115, 0.05, -0.012) }, // syringe sockets and injector at the hand end
];
function shot(i, p, out) {
  out.up.set(0, 1, 0);
  const sh = deviceShots[i];
  out.pos.lerpVectors(sh.a, sh.b, p); out.look.copy(sh.look);
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
  scene.background = new THREE.Color(0x0a1230);
  ao.updateGtaoMaterial({ radius: 0.02, distanceExponent: 1.4, thickness: 1.2, samples: 16 });
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
window.__vitacuff = { THREE, scene, camera, stages }; // handy in the console

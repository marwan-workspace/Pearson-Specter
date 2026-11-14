import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { renderer, shadows, V3, start } from './stage.js';

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

start(createDevice, drawScreen);

// Shared by VitaCuff v1 (this folder) and v2 (../vitacuff-v2): renderer, lighting, the bench stage and the
// scroll-driven camera. Each version supplies only its own wrist device and screen through start().
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const canvas = document.getElementById('scene');
export const loaderEl = document.getElementById('loader');
export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sections = [...document.querySelectorAll('section[data-stage]')];

export let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  loaderEl.textContent = 'Your browser could not start WebGL, so the 3D models are not shown.';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

export const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
export const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);

// ambient occlusion in the creases is most of what separates "rendered" from "toy"
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
composer.addPass(ao);
composer.addPass(new OutputPass());

// one shadow-casting light aimed at a stage
export function keyLight(root, color, intensity, dir, reach, centerY) {
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
export const shadows = (o) => o.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);


/** createDevice(R): the wrist unit for an arm of radius R (see either main.js); drawScreen(t, loaded): its live screen. */
export function start(createDevice, drawScreen) {
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
}

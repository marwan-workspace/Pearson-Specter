'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, type TelemetryEngine, type ZoneId, type ZoneStatus } from '@/lib/telemetry';

/**
 * The digital twin: a procedural EVA suit built from primitives, so every part is its own mesh and can be
 * clicked, tinted and focused. It reads the telemetry engine every frame:
 *   zone status  -> emissive colour (steady emerald, amber pulse, crimson strobe + shockwave, purple flicker)
 *   heart rate   -> the X-ray heart beats at exactly that rate, and arterial pulses travel with it
 *   respiration  -> chest and X-ray lungs breathe at that rate
 *   faults       -> gas particles vent from the damaged zone
 *   scanAt       -> a laser plane sweeps helmet to boots when an assessment starts
 * Astronaut faces +z. Their LEFT is +x (the viewer's right). Units are metres, feet at y = 0.
 */

const ANCHOR: Record<ZoneId, [number, number, number]> = {
  helmet: [0, 1.84, 0.16], cardio: [0, 1.46, 0.26], wrist: [0.5, 0.98, 0.12], rightArm: [-0.47, 1.06, 0.08],
  plss: [0, 1.5, -0.42], metabolic: [0, 1.1, 0.22], legs: [0.14, 0.42, 0.1],
};
/** Where the camera sits to look at each zone. */
const VIEW: Record<ZoneId, [number, number, number]> = {
  helmet: [0.55, 2.0, 1.25], cardio: [0.5, 1.55, 1.45], wrist: [1.45, 1.1, 1.0], rightArm: [-1.4, 1.2, 1.05],
  plss: [-0.95, 1.7, -1.45], metabolic: [0.6, 1.15, 1.5], legs: [0.9, 0.6, 1.6],
};
const HOME_CAM: [number, number, number] = [1.5, 1.45, 3.1];
const HOME_TARGET: [number, number, number] = [0, 1.02, 0];
const VENTING: ZoneId[] = ['rightArm', 'helmet', 'legs', 'plss'];
const PARTICLES = 420;
const SCAN_MS = 2600;

export interface SuitViewportProps {
  engine: TelemetryEngine;
  selected: ZoneId | null;
  onSelect: (zone: ZoneId | null) => void;
  xray: boolean;
  autoRotate: boolean;
  /** Colours the callout pins. */
  statuses: Record<ZoneId, ZoneStatus>;
  /** Changes when the camera should fly home. */
  resetSignal: number;
}

export default function SuitViewport({ engine, selected, onSelect, xray, autoRotate, statuses, resetSignal }: SuitViewportProps) {
  const mount = useRef<HTMLDivElement>(null);
  const pins = useRef<Partial<Record<ZoneId, HTMLButtonElement | null>>>({});
  const [failed, setFailed] = useState(false);
  // the render loop reads the latest props through this ref, so the scene is built once
  const live = useRef({ selected, onSelect, xray, autoRotate, resetSignal });
  live.current = { selected, onSelect, xray, autoRotate, resetSignal };

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 40);
    camera.position.set(...HOME_CAM);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...HOME_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.9;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.autoRotateSpeed = 0.9;

    const key = new THREE.DirectionalLight(0xdff6ff, 2.2);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0x3b82f6, 2.4);
    rim.position.set(-3, 2.5, -3);
    scene.add(key, rim, new THREE.AmbientLight(0x8fb4d9, 0.35));

    // ── materials: one shell material per zone, so each zone can glow on its own ──
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim() || '#ffffff');
    const STATUS: Record<ZoneStatus, THREE.Color> = { nominal: token('--status-nominal'), warning: token('--status-warning'), critical: token('--status-critical'), fault: token('--status-fault') };
    const CYAN = token('--accent-cyan'), COBALT = token('--accent-cobalt'), VIOLET = token('--accent-violet');
    const shell = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
    for (const z of ZONES) shell[z.id] = new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.5, metalness: 0.08, emissive: STATUS.nominal, emissiveIntensity: 0.05 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x1a2536, roughness: 0.65, metalness: 0.35 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.25, metalness: 0.9 });
    const visor = new THREE.MeshStandardMaterial({ color: 0xd9a23a, roughness: 0.06, metalness: 1, emissive: CYAN, emissiveIntensity: 0.12 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x06121c, emissive: CYAN, emissiveIntensity: 1.6, roughness: 0.4 });
    const translucent = [...Object.values(shell), joint, metal, visor, glow];

    const suit = new THREE.Group();
    scene.add(suit);
    const clickable: THREE.Object3D[] = [];
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, zone: ZoneId, at: [number, number, number], scale?: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...at);
      if (scale) mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      mesh.userData.zone = zone;
      suit.add(mesh);
      clickable.push(mesh);
      return mesh;
    };
    /** A capsule limb segment between two points. */
    const limb = (a: [number, number, number], b: [number, number, number], radius: number, zone: ZoneId) => {
      const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
      const mesh = add(new THREE.CapsuleGeometry(radius, from.distanceTo(to), 6, 16), shell[zone], zone, [0, 0, 0]);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      return mesh;
    };
    const sphere = (r: number) => new THREE.SphereGeometry(r, 32, 24);

    // helmet, visor, neck ring
    add(sphere(0.2), shell.helmet, 'helmet', [0, 1.84, 0], [1, 1.03, 1.02]);
    add(sphere(0.168), visor, 'helmet', [0, 1.845, 0.066], [1, 0.92, 0.9]);
    add(new THREE.TorusGeometry(0.135, 0.026, 12, 40), metal, 'helmet', [0, 1.665, 0], undefined, [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(0.05, 0.03, 0.05), glow, 'helmet', [0.17, 1.9, 0.1]); // helmet lamp
    // hard upper torso with the chest display and control module
    const hut = add(sphere(0.27), shell.cardio, 'cardio', [0, 1.42, 0], [1.1, 0.96, 0.84]);
    add(new THREE.BoxGeometry(0.22, 0.15, 0.07), joint, 'cardio', [0, 1.4, 0.225]);
    add(new THREE.PlaneGeometry(0.16, 0.07), glow, 'cardio', [0, 1.42, 0.262]);
    for (const x of [-0.07, 0, 0.07]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), metal, 'cardio', [x, 1.355, 0.262], undefined, [Math.PI / 2, 0, 0]);
    // PLSS backpack: frame, two O2 tanks, coolant manifold, antenna
    add(new THREE.BoxGeometry(0.46, 0.6, 0.2), shell.plss, 'plss', [0, 1.45, -0.29]);
    for (const x of [-0.115, 0.115]) add(new THREE.CapsuleGeometry(0.058, 0.36, 6, 16), metal, 'plss', [x, 1.45, -0.41]);
    add(new THREE.TorusGeometry(0.09, 0.016, 10, 28), glow, 'plss', [0, 1.16, -0.36], undefined, [Math.PI / 2.4, 0, 0]);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 8), metal, 'plss', [0.19, 1.9, -0.3]);
    const beaconTip = add(sphere(0.016), glow, 'plss', [0.19, 2.06, -0.3]);
    // core metabolic zone: abdomen, pelvis, waist bearing
    add(new THREE.CylinderGeometry(0.225, 0.205, 0.24, 32), shell.metabolic, 'metabolic', [0, 1.15, 0], [1, 1, 0.82]);
    add(sphere(0.23), shell.metabolic, 'metabolic', [0, 0.99, 0], [1, 0.62, 0.8]);
    add(new THREE.TorusGeometry(0.2, 0.022, 12, 44), metal, 'metabolic', [0, 1.045, 0], [1, 0.82, 1], [Math.PI / 2, 0, 0]);
    // arms: the astronaut's left (+x) carries the watch; the right (-x) is the glove-seal zone
    for (const side of [1, -1] as const) {
      const zone: ZoneId = side === 1 ? 'wrist' : 'rightArm';
      add(sphere(0.1), joint, zone, [side * 0.31, 1.56, 0]);
      limb([side * 0.34, 1.52, 0], [side * 0.43, 1.27, 0.02], 0.078, zone);
      add(sphere(0.082), joint, zone, [side * 0.44, 1.23, 0.025]);
      limb([side * 0.45, 1.19, 0.035], [side * 0.48, 0.97, 0.1], 0.07, zone);
      add(new THREE.TorusGeometry(0.068, 0.014, 10, 28), metal, zone, [side * 0.485, 0.93, 0.11], undefined, [Math.PI / 2, 0, 0]);
      add(sphere(0.078), shell[zone], zone, [side * 0.49, 0.85, 0.125], [1, 1.15, 0.9]);
    }
    add(new THREE.BoxGeometry(0.075, 0.1, 0.055), joint, 'wrist', [0.535, 1.0, 0.12]); // hybrid watch module
    const watchSensor = add(new THREE.PlaneGeometry(0.045, 0.06), glow.clone(), 'wrist', [0.564, 1.0, 0.12], undefined, [0, Math.PI / 2, 0]);
    // legs and magnetic boots
    for (const side of [1, -1] as const) {
      limb([side * 0.12, 0.93, 0], [side * 0.13, 0.64, 0.01], 0.105, 'legs');
      add(sphere(0.1), joint, 'legs', [side * 0.13, 0.59, 0.015]);
      limb([side * 0.13, 0.53, 0.01], [side * 0.13, 0.22, 0], 0.088, 'legs');
      add(new THREE.TorusGeometry(0.09, 0.016, 10, 28), metal, 'legs', [side * 0.13, 0.17, 0], undefined, [Math.PI / 2, 0, 0]);
      add(new THREE.BoxGeometry(0.18, 0.13, 0.33), joint, 'legs', [side * 0.13, 0.065, 0.045]);
      add(new THREE.BoxGeometry(0.185, 0.02, 0.335), glow, 'legs', [side * 0.13, 0.008, 0.045]); // magnetic sole
    }

    // ── X-ray internals ──
    const inner = new THREE.Group();
    inner.visible = false;
    suit.add(inner);
    const heartMat = new THREE.MeshStandardMaterial({ color: 0x5a0d1c, emissive: STATUS.critical, emissiveIntensity: 1.2, roughness: 0.4 });
    const heart = new THREE.Group();
    for (const [x, y, s] of [[-0.024, 0.02, 1], [0.026, 0.024, 0.92]] as const) {
      const lobe = new THREE.Mesh(sphere(0.04 * s), heartMat);
      lobe.position.set(x, y, 0);
      heart.add(lobe);
    }
    const apex = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.085, 20), heartMat);
    apex.position.set(0.002, -0.03, 0);
    apex.rotation.z = Math.PI;
    heart.add(apex);
    heart.position.set(0.035, 1.44, 0.07);
    heart.rotation.z = -0.3;
    inner.add(heart);
    const lungMat = new THREE.MeshStandardMaterial({ color: 0x0b3d52, emissive: CYAN, emissiveIntensity: 0.55, transparent: true, opacity: 0.55, roughness: 0.6 });
    const lungs = [-1, 1].map((side) => {
      const lung = new THREE.Mesh(sphere(0.1), lungMat);
      lung.position.set(side * 0.115, 1.47, 0);
      lung.scale.set(0.78, 1.45, 0.72);
      inner.add(lung);
      return lung;
    });
    const neuralMat = new THREE.MeshStandardMaterial({ color: 0x1a0f3a, emissive: VIOLET, emissiveIntensity: 1.4, wireframe: true });
    const neural = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), neuralMat);
    neural.position.set(0, 1.86, 0);
    inner.add(neural);
    const arteryMat = new THREE.MeshStandardMaterial({ color: 0x0c1f4d, emissive: COBALT, emissiveIntensity: 0.9 });
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core: [number, number, number] = [0.02, 1.44, 0.05];
    const arteries = ([
      [core, [0, 1.62, 0.02], [0, 1.84, 0]],
      [core, [0.2, 1.54, 0], [0.43, 1.25, 0.02], [0.48, 0.9, 0.11]],
      [core, [-0.2, 1.54, 0], [-0.43, 1.25, 0.02], [-0.48, 0.9, 0.11]],
      [core, [0.04, 1.1, 0.02], [0.12, 0.9, 0], [0.13, 0.58, 0.01], [0.13, 0.12, 0.02]],
      [core, [-0.04, 1.1, 0.02], [-0.12, 0.9, 0], [-0.13, 0.58, 0.01], [-0.13, 0.12, 0.02]],
    ] as [number, number, number][][]).map((points) => {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      inner.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.007, 8), arteryMat));
      const pulse = new THREE.Mesh(sphere(0.016), pulseMat);
      inner.add(pulse);
      return { curve, pulse };
    });

    // ── orbital radar floor ──
    const floor = new THREE.Group();
    scene.add(floor);
    const lineMat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.32 });
    for (const r of [0.45, 0.8, 1.15, 1.5]) {
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2).getPoints(96)), lineMat);
      ring.rotation.x = -Math.PI / 2;
      floor.add(ring);
    }
    const spokes: number[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spokes.push(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5); }
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3)), lineMat));
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32, 0, 0.6), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.y = 0.002;
    floor.add(sweep);

    // ── effects: shockwave rings, venting particles, scan plane ──
    const rings = {} as Record<ZoneId, THREE.Mesh>;
    for (const z of ZONES) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: STATUS.critical, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.set(...ANCHOR[z.id]);
      ring.visible = false;
      suit.add(ring);
      rings[z.id] = ring;
    }
    const pPos = new Float32Array(PARTICLES * 3).fill(999);
    const pVel = new Float32Array(PARTICLES * 3);
    const pLife = new Float32Array(PARTICLES);
    const pGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xcffaff, size: 0.022, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    points.frustumCulled = false;
    suit.add(points);
    const scan = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.85, 64), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    scan.rotation.x = -Math.PI / 2;
    scan.visible = false;
    scene.add(scan);

    // ── interaction ──
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    let flying: { cam: THREE.Vector3; target: THREE.Vector3 } | null = null;
    const zoneAt = (e: PointerEvent): ZoneId | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return (ray.intersectObjects(clickable, false)[0]?.object.userData.zone as ZoneId | undefined) ?? null;
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // that was a drag, not a click
      const zone = zoneAt(e);
      if (zone) live.current.onSelect(zone);
    };
    const onMove = (e: PointerEvent) => { renderer.domElement.style.cursor = zoneAt(e) ? 'pointer' : 'grab'; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    controls.addEventListener('start', () => { flying = null; }); // the user took the camera

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; });
    visibility.observe(host);

    // ── the frame loop ──
    let raf = 0, last = performance.now(), t = 0, heartPhase = 0, breathPhase = 0;
    let seenSelected: ZoneId | null = null, seenReset = live.current.resetSignal, seenXray: boolean | null = null;
    const v = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!onScreen || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = engine.sample(now);
      const sim = s.paused ? 0 : dt * s.speed;
      t += sim;
      const props = live.current;

      // camera: fly to the selected zone, or home on reset
      if (props.selected !== seenSelected) {
        seenSelected = props.selected;
        if (props.selected) {
          // stand back far enough to keep the neighbouring parts in view
          const target = new THREE.Vector3(...ANCHOR[props.selected]);
          flying = { cam: new THREE.Vector3(...VIEW[props.selected]).sub(target).multiplyScalar(1.5).add(target), target };
        }
      }
      if (props.resetSignal !== seenReset) {
        seenReset = props.resetSignal;
        flying = { cam: new THREE.Vector3(...HOME_CAM), target: new THREE.Vector3(...HOME_TARGET) };
      }
      if (flying) {
        const k = 1 - Math.exp(-dt * 4.5);
        camera.position.lerp(flying.cam, k);
        controls.target.lerp(flying.target, k);
        if (camera.position.distanceTo(flying.cam) < 0.01) flying = null;
      }
      controls.autoRotate = props.autoRotate && !flying && !reduced;
      controls.update();

      // render mode
      if (props.xray !== seenXray) {
        seenXray = props.xray;
        inner.visible = props.xray;
        for (const m of translucent) { m.transparent = props.xray; m.opacity = props.xray ? 0.18 : 1; m.depthWrite = !props.xray; m.needsUpdate = true; }
      }

      // body motion: breathing at the live respiration rate, a slow zero-g drift
      heartPhase = (heartPhase + sim * Math.max(20, s.sensorFault ? 72 : s.values.hr) / 60) % 1;
      breathPhase += sim * (s.values.resp / 60) * Math.PI * 2;
      const breath = Math.sin(breathPhase);
      hut.scale.set(1.1 * (1 + 0.012 * breath), 0.96, 0.84 * (1 + 0.03 * breath));
      if (!reduced) {
        suit.position.y = 0.03 + Math.sin(t * 0.55) * 0.022;
        suit.rotation.z = Math.sin(t * 0.37) * 0.012;
        suit.rotation.x = Math.sin(t * 0.29) * 0.01;
      }
      sweep.rotation.z = -t * 0.7;

      // X-ray anatomy
      if (props.xray) {
        const beat = 1 + 0.17 * Math.exp(-((heartPhase - 0.08) ** 2) / 0.003) + 0.09 * Math.exp(-((heartPhase - 0.26) ** 2) / 0.005);
        heart.scale.setScalar(beat);
        heartMat.emissiveIntensity = 0.7 + (beat - 1) * 6;
        for (const lung of lungs) lung.scale.set(0.78 * (1 + 0.1 * breath), 1.45 * (1 + 0.05 * breath), 0.72 * (1 + 0.14 * breath));
        neural.rotation.y = t * 0.5;
        neuralMat.emissiveIntensity = 1 + 0.6 * Math.sin(t * (s.activity === 'stress' ? 9 : 3));
        arteries.forEach(({ curve, pulse }, i) => { pulse.position.copy(curve.getPointAt((heartPhase + i * 0.07) % 1)); });
      }

      // zone status -> glow
      for (const z of ZONES) {
        const status = s.zones[z.id];
        const m = shell[z.id];
        m.emissive.copy(STATUS[status]);
        m.emissiveIntensity = (props.xray ? 2.2 : 1) * (
          status === 'nominal' ? 0.05
          : status === 'warning' ? 0.3 + 0.22 * Math.sin(t * Math.PI * 2)
          : status === 'critical' ? (Math.sin(t * Math.PI * 6) > 0 ? 1.05 : 0.18)
          : 0.35 + 0.5 * Math.random()
        ) + (props.selected === z.id ? 0.12 : 0);
        const ring = rings[z.id];
        ring.visible = status === 'critical';
        if (ring.visible) {
          const p = (t * 0.75 + z.number * 0.13) % 1;
          ring.scale.setScalar(0.08 + p * 0.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - p);
          ring.lookAt(camera.position);
        }
      }
      (watchSensor.material as THREE.MeshStandardMaterial).emissive.copy(s.sensorFault ? STATUS.fault : CYAN);
      (watchSensor.material as THREE.MeshStandardMaterial).emissiveIntensity = s.sensorFault ? 0.4 + 2 * Math.random() : 1.2 + 0.6 * Math.exp(-((heartPhase - 0.1) ** 2) / 0.004);
      beaconTip.scale.setScalar(1 + 0.6 * Math.max(0, Math.sin(t * 3)));

      // venting gas from every breached zone
      const vents = s.faults.filter((id) => VENTING.includes(id));
      for (let i = 0; i < PARTICLES; i++) {
        pLife[i] -= sim;
        if (pLife[i] <= 0) {
          if (!vents.length) { pPos[i * 3 + 1] = 999; continue; }
          const [ax, ay, az] = ANCHOR[vents[i % vents.length]];
          const out = new THREE.Vector3(ax, 0, az).normalize();
          pPos[i * 3] = ax; pPos[i * 3 + 1] = ay; pPos[i * 3 + 2] = az;
          pVel[i * 3] = out.x * (0.5 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.35;
          pVel[i * 3 + 1] = (Math.random() - 0.35) * 0.45;
          pVel[i * 3 + 2] = out.z * (0.5 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.35;
          pLife[i] = 0.5 + Math.random() * 1.1;
        } else {
          pPos[i * 3] += pVel[i * 3] * sim; pPos[i * 3 + 1] += pVel[i * 3 + 1] * sim; pPos[i * 3 + 2] += pVel[i * 3 + 2] * sim;
        }
      }
      pGeo.attributes.position.needsUpdate = true;

      // assessment scan: a plane sweeps from helmet to boots
      const scanning = s.scanAt > 0 && now - s.scanAt < SCAN_MS;
      scan.visible = scanning;
      if (scanning) {
        const p = (now - s.scanAt) / SCAN_MS;
        scan.position.y = 2.08 - p * 2.08;
        (scan.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.05));
      }

      // callout pins follow their zones
      for (const z of ZONES) {
        const el = pins.current[z.id];
        if (!el) continue;
        v.set(...ANCHOR[z.id]).applyMatrix4(suit.matrixWorld).project(camera);
        const visible = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
        el.style.opacity = visible ? '1' : '0';
        el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * host.clientWidth}px, ${((1 - v.y) / 2) * host.clientHeight}px)`;
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      visibility.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => m.dispose());
      });
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [engine]);

  if (failed) return <div className="grid h-full place-items-center p-6 text-center text-sm text-secondary">This browser cannot draw 3D. Every zone is still available from the buttons below.</div>;
  return (
    <div ref={mount} className="absolute inset-0">
      {ZONES.map((z) => (
        // The pins repeat the zone buttons under the viewport, so they are kept out of the tab order.
        <button key={z.id} ref={(el) => { pins.current[z.id] = el; }} type="button" tabIndex={-1} aria-hidden onClick={() => onSelect(z.id)}
          className={`pin ${selected === z.id ? 'pin-on' : ''}`} data-status={statuses[z.id]} style={{ opacity: 0 }}>
          {z.number}
        </button>
      ))}
    </div>
  );
}

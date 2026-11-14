'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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
  helmet: [0, 1.66, 0.12], cardio: [0, 1.32, 0.1], wrist: [0.445, 1.02, 0.05], rightArm: [-0.4, 1.12, 0.0],
  plss: [0, 1.3, -0.33], metabolic: [0, 1.0, 0.08], legs: [0.12, 0.42, 0.06],
};
/** Where the camera sits to look at each zone. */
const VIEW: Record<ZoneId, [number, number, number]> = {
  helmet: [0.5, 1.8, 1.15], cardio: [0.45, 1.4, 1.4], wrist: [1.35, 1.15, 0.95], rightArm: [-1.3, 1.25, 1.0],
  plss: [-0.9, 1.5, -1.45], metabolic: [0.55, 1.05, 1.45], legs: [0.85, 0.6, 1.6],
};
const HOME_CAM: [number, number, number] = [1.4, 1.35, 3.0];
const HOME_TARGET: [number, number, number] = [0, 0.95, 0];
const VENTING: ZoneId[] = ['rightArm', 'helmet', 'legs', 'plss'];
const PARTICLES = 420;
const SCAN_MS = 2600;
/** Each zone as body segments (suit space, ACES at 1.8 m): the real suit glows wherever its cloth lies inside one. */
type V3 = [number, number, number];
const seg = (zone: ZoneId, a: V3, b: V3, r: number) => ({ zone, a, b, r });
const SEGMENTS = [
  seg('helmet', [0, 1.6, -0.04], [0, 1.7, -0.04], 0.2),
  seg('cardio', [0, 1.38, -0.07], [0, 1.24, -0.07], 0.25),
  seg('plss', [0, 1.42, -0.24], [0, 1.12, -0.24], 0.17),
  seg('metabolic', [0, 1.12, -0.07], [0, 0.86, -0.07], 0.23),
  ...([[1, 'wrist'], [-1, 'rightArm']] as const).flatMap(([s, zone]) => [
    seg(zone, [s * 0.25, 1.42, -0.07], [s * 0.38, 1.16, -0.06], 0.11),
    seg(zone, [s * 0.38, 1.16, -0.06], [s * 0.37, 0.92, 0.13], 0.1),
  ]),
  ...[1, -1].flatMap((s) => [
    seg('legs', [s * 0.11, 0.8, -0.07], [s * 0.12, 0.5, -0.05], 0.13),
    seg('legs', [s * 0.12, 0.5, -0.05], [s * 0.12, 0.0, 0.0], 0.13),
  ]),
];
const SUIT_HEIGHT = 1.8;
const SUIT_TURN = Math.PI; // the file faces -z; the twin faces +z

/**
 * The X-ray look for the suit: a see-through shell whose edges glow (fresnel), with fine scan lines and a bright
 * band that travels head to feet. Additive and depth-free, so the anatomy inside always shows through.
 */
function xrayMaterial(color: THREE.Color, { scan = true, base = 0.05, rim = 0.55, power = 2.4 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: color.clone() }, time: { value: 0 } },
    defines: { SCAN: scan ? 1 : 0, BASE: base.toFixed(3), RIM: rim.toFixed(3), POWER: power.toFixed(3) },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying float vY;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vY = world.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float time;
      varying vec3 vNormal; varying vec3 vView; varying float vY;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), POWER);
        float a = BASE + RIM * rim;
        #if SCAN == 1
          float band = exp(-pow((vY - (2.05 - mod(time * 0.35, 2.4))) * 9.0, 2.0));
          a = a * (0.85 + 0.15 * sin(vY * 420.0)) + 0.35 * band;
        #endif
        gl_FragColor = vec4(color * a, a);
      }`,
  });
}

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

    const key = new THREE.DirectionalLight(0xe2e8f0, 2.2);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0xf59e0b, 2.4);
    rim.position.set(-3, 2.5, -3);
    scene.add(key, rim, new THREE.AmbientLight(0xe2e8f0, 0.35));

    // ── materials: one shell material per zone, so each zone can glow on its own ──
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim() || '#ffffff');
    const STATUS: Record<ZoneStatus, THREE.Color> = { nominal: token('--status-nominal'), warning: token('--status-warning'), critical: token('--status-critical'), fault: token('--status-fault') };
    const AMBER = token('--accent-primary'), PLATINUM = token('--accent-secondary'), VIOLET = token('--accent-violet');
    const shell = {} as Record<ZoneId, THREE.MeshStandardMaterial>;
    for (const z of ZONES) shell[z.id] = new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.5, metalness: 0.08, emissive: STATUS.nominal, emissiveIntensity: 0.05 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.65, metalness: 0.35 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.25, metalness: 0.9 });
    const visor = new THREE.MeshStandardMaterial({ color: 0xd9a23a, roughness: 0.06, metalness: 1, emissive: AMBER, emissiveIntensity: 0.12 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x0f1117, emissive: AMBER, emissiveIntensity: 1.6, roughness: 0.4 });
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

    // Proportioned to the ACES suit measured at 1.8 m: torso centred at z = -0.07, shoulders at y 1.42,
    // elbows out at x 0.38, gloves held a little forward at y 0.93.
    // helmet, visor, neck ring
    add(sphere(0.155), shell.helmet, 'helmet', [0, 1.64, -0.04], [1, 1.08, 1.05]);
    add(sphere(0.13), visor, 'helmet', [0, 1.64, 0.01], [1, 0.9, 0.9]);
    add(new THREE.TorusGeometry(0.12, 0.022, 12, 40), metal, 'helmet', [0, 1.49, -0.05], undefined, [Math.PI / 2, 0, 0]);
    // upper torso: heart and lungs, with the chest display
    const hut = add(sphere(0.25), shell.cardio, 'cardio', [0, 1.3, -0.07], [1.12, 0.82, 0.68]);
    add(new THREE.PlaneGeometry(0.14, 0.06), glow, 'cardio', [0, 1.3, 0.1]);
    // life support: the oxygen and cooling pack on the back, with its beacon
    add(new THREE.BoxGeometry(0.4, 0.42, 0.09), shell.plss, 'plss', [0, 1.28, -0.27]);
    const beaconTip = add(sphere(0.014), glow, 'plss', [0.15, 1.52, -0.3]);
    // core metabolic zone: abdomen and pelvis
    add(new THREE.CylinderGeometry(0.2, 0.19, 0.2, 32), shell.metabolic, 'metabolic', [0, 1.06, -0.07], [1, 1, 0.75]);
    add(sphere(0.2), shell.metabolic, 'metabolic', [0, 0.9, -0.07], [1, 0.6, 0.75]);
    // arms: the astronaut's left (+x) carries the watch; the right (-x) is the glove-seal zone
    for (const side of [1, -1] as const) {
      const zone: ZoneId = side === 1 ? 'wrist' : 'rightArm';
      add(sphere(0.085), joint, zone, [side * 0.27, 1.42, -0.07]);
      limb([side * 0.28, 1.4, -0.07], [side * 0.38, 1.17, -0.06], 0.075, zone);
      add(sphere(0.07), joint, zone, [side * 0.385, 1.15, -0.05]);
      limb([side * 0.385, 1.14, -0.04], [side * 0.37, 1.0, 0.06], 0.062, zone);
      add(new THREE.TorusGeometry(0.06, 0.012, 10, 28), metal, zone, [side * 0.37, 0.99, 0.07], undefined, [Math.PI / 2.6, 0, 0]);
      add(sphere(0.065), shell[zone], zone, [side * 0.37, 0.93, 0.14], [1, 1.1, 0.9]);
    }
    const watchBody = add(new THREE.BoxGeometry(0.05, 0.075, 0.06), joint, 'wrist', [0.415, 1.02, 0.05]); // hybrid watch module
    const watchSensor = add(new THREE.PlaneGeometry(0.036, 0.05), glow.clone(), 'wrist', [0.441, 1.02, 0.05], undefined, [0, Math.PI / 2, 0]);
    const watchParts: THREE.Object3D[] = [watchBody, watchSensor];
    // legs and boots
    for (const side of [1, -1] as const) {
      limb([side * 0.11, 0.82, -0.07], [side * 0.12, 0.52, -0.05], 0.1, 'legs');
      add(sphere(0.085), joint, 'legs', [side * 0.12, 0.5, -0.05]);
      limb([side * 0.12, 0.47, -0.05], [side * 0.12, 0.16, -0.06], 0.08, 'legs');
      add(new THREE.BoxGeometry(0.16, 0.12, 0.3), joint, 'legs', [side * 0.12, 0.06, 0.02]);
      add(new THREE.BoxGeometry(0.165, 0.016, 0.305), glow, 'legs', [side * 0.12, 0.006, 0.02]); // magnetic sole
    }

    // ── the real suit: NASA's Advanced Crew Escape Suit (NASA 3D Resources), the file the VitaCuff page uses ──
    // Until it loads (or if it cannot), the primitive suit above is what you see. Once it is in, the primitives
    // stay as invisible click targets, and each zone's shell turns into a status glow drawn over the real suit.
    const realSuit = new THREE.Group();
    suit.add(realSuit);
    const suitParts: { mesh: THREE.Mesh; solid: THREE.Material }[] = [];
    const aura = {} as Record<ZoneId, THREE.MeshBasicMaterial>;
    for (const z of ZONES) aura[z.id] = new THREE.MeshBasicMaterial({ color: STATUS.nominal, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const ghost = xrayMaterial(PLATINUM, { base: 0.02, rim: 0.42 });
    // status glow painted onto the real suit's cloth: per segment, colour x intensity, updated every frame
    const zoneGlow = {
      suitInverse: { value: new THREE.Matrix4() },
      segA: { value: SEGMENTS.map((g) => new THREE.Vector3(...g.a)) },
      segB: { value: SEGMENTS.map((g) => new THREE.Vector3(...g.b)) },
      segR: { value: SEGMENTS.map((g) => g.r) },
      segGlow: { value: SEGMENTS.map(() => new THREE.Color(0, 0, 0)) },
    };
    const withZoneGlow = (m: THREE.MeshPhysicalMaterial) => {
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, zoneGlow);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat4 suitInverse;\nvarying vec3 vSuitPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuitPos = (suitInverse * modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vSuitPos;
            uniform vec3 segA[${SEGMENTS.length}]; uniform vec3 segB[${SEGMENTS.length}];
            uniform float segR[${SEGMENTS.length}]; uniform vec3 segGlow[${SEGMENTS.length}];
            vec3 zoneGlowAt() {
              vec3 g = vec3(0.0);
              for (int i = 0; i < ${SEGMENTS.length}; i++) {
                vec3 pa = vSuitPos - segA[i], ba = segB[i] - segA[i];
                float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
                g += segGlow[i] * smoothstep(segR[i], segR[i] * 0.45, length(pa - ba * h));
              }
              return g;
            }`)
          // light added to orange cloth only reads as brighter orange, so the cloth itself takes the status hue
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 zg = zoneGlowAt();
            float zmax = max(zg.r, max(zg.g, zg.b));
            diffuseColor.rgb = mix(diffuseColor.rgb, zg / max(zmax, 1e-4) * 0.32, clamp(zmax * 0.4, 0.0, 0.85));`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += zg * 0.35;');
      };
      m.customProgramCacheKey = () => 'zone-glow';
      return m;
    };
    let loaded = false, disposed = false;
    const draco = new DRACOLoader().setDecoderPath('/vitacuff/vendor/three/addons/libs/draco/gltf/');
    new GLTFLoader().setDRACOLoader(draco).load('/vitacuff/assets/aces.glb', ({ scene: model }) => {
      if (disposed) return;
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      realSuit.add(model);
      realSuit.scale.setScalar(SUIT_HEIGHT / size.y);
      realSuit.rotation.y = SUIT_TURN;
      // The file ships flat, glass-like materials: rebuild them as suit cloth, with a mirrored visor.
      const swapped = new Map<THREE.Material, THREE.Material>(), hsl = { h: 0, s: 0, l: 0 }, c = new THREE.Vector3();
      realSuit.updateMatrixWorld(true);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const old = mesh.material as THREE.MeshStandardMaterial;
        if (!swapped.has(old)) {
          old.color.getHSL(hsl);
          new THREE.Box3().setFromObject(mesh).getCenter(c);
          const onHead = c.y > 1.45 * (SUIT_HEIGHT / 1.8), golden = hsl.s > 0.25 && hsl.h > 0.08 && hsl.h < 0.17;
          const color = old.color.clone();
          // the file's fabric is a pale peach; ACES is international orange (deeper on the gloves)
          if (hsl.h < 0.11 && hsl.s > 0.2 && hsl.l > 0.3) color.set(hsl.l > 0.55 ? 0xd2561c : 0xb4441a);
          swapped.set(old, withZoneGlow(onHead && (golden || hsl.l < 0.05)
            ? new THREE.MeshPhysicalMaterial({ color: golden ? 0xc9983a : 0x0b0c10, metalness: 1, roughness: 0.07, clearcoat: 1, envMapIntensity: 2.5 })
            : new THREE.MeshPhysicalMaterial({ color, map: old.map, roughness: 0.88, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, sheenColor: color })));
          old.dispose();
        }
        mesh.material = swapped.get(old)!;
        suitParts.push({ mesh, solid: mesh.material });
      });
      for (const o of clickable) {
        const m = o as THREE.Mesh;
        const zone = m.userData.zone as ZoneId;
        if (m.material === shell[zone] || m === hut) m.material = aura[zone];
        else if (!watchParts.includes(m)) m.visible = false; // three's raycaster still hits hidden meshes
      }
      loaded = true;
      seenXray = null; // re-apply the render mode to the new materials
    }, undefined, () => { /* keep the primitive suit */ });

    // ── X-ray internals ──
    const inner = new THREE.Group();
    inner.visible = false;
    suit.add(inner);
    type P = [number, number, number];
    const tube = (points: P[], radius: number, material: THREE.Material, segments = 32) => {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
      inner.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8), material));
      return curve;
    };
    // skeleton: bone glows faintly so the organs read in front of it
    const boneMat = xrayMaterial(new THREE.Color(0xbcd6ff), { scan: false, base: 0.3, rim: 0.9, power: 1.4 }); // cool bone-white, apart from the shell
    const skull = new THREE.Mesh(sphere(0.082), boneMat);
    skull.position.set(0, 1.665, -0.045);
    skull.scale.set(0.9, 1.06, 1.08);
    inner.add(skull);
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 24, Math.PI), boneMat);
    jaw.position.set(0, 1.59, -0.02);
    jaw.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI);
    inner.add(jaw);
    const spine: P[] = [];
    for (let i = 0; i <= 24; i++) { const k = i / 24; spine.push([0, 1.55 - k * 0.62, -0.125 - 0.025 * Math.sin(k * Math.PI * 1.6)]); }
    for (const [x, y, z] of spine) {
      const vertebra = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.016, 12), boneMat);
      vertebra.position.set(x, y, z);
      inner.add(vertebra);
    }
    for (let i = 0; i < 10; i++) {
      // each rib curves from the spine round to the front, sloping down; the lower ones are wider and shorter
      const y = 1.43 - i * 0.032, rx = 0.1 + 0.075 * Math.sin(Math.min(1, (i + 2) / 7) * Math.PI / 2), reach = i < 7 ? 0.86 : 0.62 + (9 - i) * 0.06;
      for (const side of [1, -1]) {
        const pts: P[] = [];
        for (let j = 0; j <= 10; j++) { const a = 0.12 * Math.PI + (j / 10) * reach * Math.PI; pts.push([side * rx * Math.sin(a), y - 0.045 * Math.sin(a / 2), -0.075 - 0.115 * Math.cos(a)]); }
        tube(pts, 0.0065, boneMat, 20);
      }
    }
    tube([[0, 1.42, 0.035], [0, 1.24, 0.045]], 0.011, boneMat, 4); // sternum
    for (const side of [1, -1]) {
      tube([[side * 0.02, 1.44, 0.03], [side * 0.12, 1.455, -0.02], [side * 0.22, 1.45, -0.07]], 0.008, boneMat, 12); // collarbone
      tube([[side * 0.26, 1.42, -0.07], [side * 0.375, 1.16, -0.055]], 0.013, boneMat, 8); // upper arm
      tube([[side * 0.38, 1.14, -0.05], [side * 0.37, 1.0, 0.06]], 0.01, boneMat, 8); // forearm
      tube([[side * 0.1, 0.87, -0.07], [side * 0.12, 0.51, -0.05]], 0.016, boneMat, 8); // thigh
      tube([[side * 0.12, 0.48, -0.05], [side * 0.12, 0.12, -0.06]], 0.013, boneMat, 8); // shin
    }
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 32), boneMat);
    pelvis.position.set(0, 0.9, -0.08);
    pelvis.scale.set(1.25, 0.8, 1);
    pelvis.rotation.x = Math.PI / 2.4;
    inner.add(pelvis);

    // heart: two atria over a ventricle that tapers to the apex, plus the aorta arching over and down the spine
    const heartMat = new THREE.MeshStandardMaterial({ color: 0x5a0d1c, emissive: STATUS.critical, emissiveIntensity: 1.2, roughness: 0.35 });
    const heart = new THREE.Group();
    for (const [x, y, s] of [[-0.022, 0.022, 1], [0.024, 0.026, 0.9]] as const) {
      const lobe = new THREE.Mesh(sphere(0.036 * s), heartMat);
      lobe.position.set(x, y, 0);
      heart.add(lobe);
    }
    const ventricle = new THREE.Mesh(sphere(0.05), heartMat);
    ventricle.position.set(0.004, -0.012, 0);
    ventricle.scale.set(1, 1.15, 0.85);
    heart.add(ventricle);
    const apex = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 20), heartMat);
    apex.position.set(0.006, -0.065, 0);
    apex.rotation.z = Math.PI;
    heart.add(apex);
    heart.position.set(0.03, 1.29, -0.03);
    heart.rotation.z = -0.35;
    inner.add(heart);
    tube([[0.02, 1.33, -0.03], [0.012, 1.385, -0.05], [-0.015, 1.39, -0.09], [-0.02, 1.33, -0.11], [-0.02, 1.0, -0.1]], 0.0095, heartMat, 40);

    // lungs: tapered lobes on either side of the heart, fed by the windpipe and its airways
    const lungMat = xrayMaterial(new THREE.Color(0xff8f7a), { scan: false, base: 0.2, rim: 1.0, power: 1.5 });
    const lungProfile = [[0, -0.13], [0.06, -0.125], [0.082, -0.07], [0.082, 0.0], [0.07, 0.06], [0.045, 0.105], [0.018, 0.128], [0, 0.132]].map(([r, y]) => new THREE.Vector2(r, y));
    const lungs = [-1, 1].map((side) => {
      const lung = new THREE.Mesh(new THREE.LatheGeometry(lungProfile, 32), lungMat);
      lung.position.set(side * 0.098, 1.31, -0.08);
      inner.add(lung);
      return lung;
    });
    const airwayMat = new THREE.MeshStandardMaterial({ color: 0x2a1d10, emissive: AMBER, emissiveIntensity: 0.9 });
    tube([[0, 1.52, -0.06], [0, 1.4, -0.07]], 0.009, airwayMat, 6); // windpipe
    for (const side of [1, -1]) {
      tube([[0, 1.4, -0.07], [side * 0.05, 1.37, -0.08], [side * 0.085, 1.33, -0.08]], 0.006, airwayMat, 12);
      tube([[side * 0.085, 1.33, -0.08], [side * 0.105, 1.27, -0.07], [side * 0.11, 1.22, -0.07]], 0.0035, airwayMat, 12);
      tube([[side * 0.085, 1.33, -0.08], [side * 0.11, 1.37, -0.09], [side * 0.115, 1.41, -0.09]], 0.0035, airwayMat, 12);
    }

    // brain: a folded surface (two hemispheres split by a groove) inside the skull
    const brainGeo = new THREE.SphereGeometry(0.066, 64, 48);
    const bp = brainGeo.attributes.position, q = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) {
      q.fromBufferAttribute(bp, i);
      const folds = 1 + 0.07 * Math.sin(q.x * 160) * Math.sin(q.y * 140) * Math.sin(q.z * 120);
      const groove = 1 - 0.12 * Math.exp(-((q.x / 0.008) ** 2)) * Math.max(0, q.y / 0.066 + 0.4);
      q.multiplyScalar(folds * groove);
      bp.setXYZ(i, q.x, q.y, q.z);
    }
    brainGeo.computeVertexNormals();
    const neuralMat = new THREE.MeshStandardMaterial({ color: 0x8a6ff0, emissive: VIOLET, emissiveIntensity: 0.35, roughness: 0.55 }); // lit, so the folds read
    const neural = new THREE.Mesh(brainGeo, neuralMat);
    neural.position.set(0, 1.685, -0.045);
    neural.scale.set(0.9, 0.82, 1.1);
    inner.add(neural);

    // arteries along the real limbs, each carrying a pulse that leaves the heart on every beat
    const arteryMat = new THREE.MeshStandardMaterial({ color: 0x34343b, emissive: STATUS.critical, emissiveIntensity: 0.55 });
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core: P = [0.02, 1.3, -0.03];
    const arteries = ([
      [core, [0.01, 1.45, -0.06], [0.005, 1.6, -0.05]],
      [core, [0.18, 1.4, -0.07], [0.375, 1.16, -0.05], [0.37, 0.98, 0.07]],
      [core, [-0.18, 1.4, -0.07], [-0.375, 1.16, -0.05], [-0.37, 0.98, 0.07]],
      [core, [0.04, 0.98, -0.08], [0.1, 0.86, -0.06], [0.125, 0.5, -0.03], [0.125, 0.12, -0.04]],
      [core, [-0.04, 0.98, -0.08], [-0.1, 0.86, -0.06], [-0.125, 0.5, -0.03], [-0.125, 0.12, -0.04]],
    ] as P[][]).map((points) => {
      const curve = tube(points, 0.0045, arteryMat, 48);
      const pulse = new THREE.Mesh(sphere(0.012), pulseMat);
      inner.add(pulse);
      return { curve, pulse };
    });

    // ── orbital radar floor ──
    const floor = new THREE.Group();
    scene.add(floor);
    const lineMat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.32 });
    for (const r of [0.45, 0.8, 1.15, 1.5]) {
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2).getPoints(96)), lineMat);
      ring.rotation.x = -Math.PI / 2;
      floor.add(ring);
    }
    const spokes: number[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spokes.push(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5); }
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3)), lineMat));
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32, 0, 0.6), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
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
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.022, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    points.frustumCulled = false;
    suit.add(points);
    const scan = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.85, 64), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
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
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first rAF stamp can predate `last`
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
        for (const p of suitParts) p.mesh.material = props.xray ? ghost : p.solid;
      }
      ghost.uniforms.time.value = t;
      suit.updateMatrixWorld();
      zoneGlow.suitInverse.value.copy(suit.matrixWorld).invert();

      // body motion: breathing at the live respiration rate, a slow zero-g drift
      // a missing sample must not turn a phase into NaN: NaN never recovers and stops the render loop
      const hr = s.sensorFault || !Number.isFinite(s.values.hr) ? 72 : s.values.hr, resp = Number.isFinite(s.values.resp) ? s.values.resp : 14;
      heartPhase = (heartPhase + sim * Math.max(20, hr) / 60) % 1;
      breathPhase += sim * (resp / 60) * Math.PI * 2;
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
        for (const lung of lungs) lung.scale.set(1 + 0.08 * breath, 1 + 0.04 * breath, 0.8 * (1 + 0.12 * breath));
        neuralMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * (s.activity === 'stress' ? 9 : 3));
        arteries.forEach(({ curve, pulse }, i) => {
          const u = (((heartPhase + i * 0.07) % 1) + 1) % 1; // getPointAt reads past the curve for u outside [0, 1)
          if (Number.isFinite(u)) pulse.position.copy(curve.getPointAt(u));
        });
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
        if (loaded) {
          // Only problems glow, plus a hint on the zone you picked. On the real suit the cloth itself lights up;
          // in X-ray the zone shapes glow around the anatomy instead.
          const level = status === 'nominal' ? (props.selected === z.id ? 0.1 : 0) : m.emissiveIntensity;
          aura[z.id].color.copy(STATUS[status]);
          aura[z.id].opacity = props.xray ? Math.min(0.6, level * 0.45) : 0;
          SEGMENTS.forEach((g, i) => { if (g.zone === z.id) zoneGlow.segGlow.value[i].copy(STATUS[status]).multiplyScalar(props.xray ? 0 : level * 2.4); }); // strong: red and amber must read on orange cloth
        }
        const ring = rings[z.id];
        ring.visible = status === 'critical';
        if (ring.visible) {
          const p = (t * 0.75 + z.number * 0.13) % 1;
          ring.scale.setScalar(0.08 + p * 0.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - p);
          ring.lookAt(camera.position);
        }
      }
      (watchSensor.material as THREE.MeshStandardMaterial).emissive.copy(s.sensorFault ? STATUS.fault : AMBER);
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
      disposed = true;
      draco.dispose();
      ghost.dispose();
      for (const z of ZONES) aura[z.id].dispose();
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

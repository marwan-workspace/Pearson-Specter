'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Stars, useGLTF } from '@react-three/drei';
import { Box3, Color, MeshStandardMaterial, Vector3, type Group, type Mesh, type MeshBasicMaterial, type Object3D, type PointLight } from 'three';
import type { Status } from '@/lib/types';
import type { ZoneId } from '@/lib/zones';

/**
 * The crew member's digital twin: NASA's own Extravehicular Mobility Unit model
 * (public domain, github.com/nasa/NASA-3D-Resources), floating in microgravity.
 *
 *  - the suit's ID stripes take the crew member's colour, the way real EVA suits tell astronauts apart;
 *  - body zones glow where the problem is: the heart turns coral for a cardiac event and beats at the
 *    live heart rate, the lungs for low oxygen, and so on. Each zone can be pointed at and picked;
 *  - the suit leans toward the pointer, so it feels held rather than played back;
 *  - with reduced motion on, the suit holds a still pose and only re-renders when something changes.
 */
const MODEL = '/models/emu.glb';
const DRACO = '/draco/';
const SUIT_HEIGHT = 3.4;

// Deeper than the interface's status colours: on a sunlit white suit, pale coral and amber wash out to white.
const STATUS_COLOR: Record<Status, string> = { nominal: '#5fe0a6', watch: '#ffab1f', critical: '#ff3b30' };

export interface SceneProps {
  /** Colour of the suit's ID stripes. */
  stripe: string;
  status: Status;
  /** Beats per minute; 0 stops the chest light (sensor fault). */
  heartRate: number;
  /** Drag to rotate, scroll to zoom. */
  interactive?: boolean;
  stars?: boolean;
  /** Hold a still pose (prefers-reduced-motion). */
  still: boolean;
  /** Render only while on screen and the tab is visible. */
  active: boolean;
  onReady?: () => void;
  /** Health of each body zone. */
  zones?: { id: ZoneId; status: Status }[];
  selectedZone?: ZoneId | null;
  hoveredZone?: ZoneId | null;
  onZonePick?: (id: ZoneId) => void;
  onZoneHover?: (id: ZoneId | null) => void;
}

/* Where each zone sits on the suit, in the floating group's space (the suit is 3.4 units tall, centred). */
const ZONE_POS: Record<ZoneId, [number, number, number]> = {
  head: [0, 1.36, 0.4],
  heart: [0.17, 0.9, 0.44],
  lungs: [-0.17, 0.9, 0.44],
  circulation: [0.78, 0.3, 0.3],
  radiation: [-0.3, -0.42, 0.4],
};

function Zone({ id, status, selected, hovered, still, heartRate, onPick, onHover }: { id: ZoneId; status: Status; selected: boolean; hovered: boolean; still: boolean; heartRate: number; onPick?: (id: ZoneId) => void; onHover?: (id: ZoneId | null) => void }) {
  const halo = useRef<Mesh>(null);
  const haloMat = useRef<MeshBasicMaterial>(null);
  const light = useRef<PointLight>(null);
  const ring = useRef<Mesh>(null);
  const color = STATUS_COLOR[status];
  const level = status === 'critical' ? 1 : status === 'watch' ? 0.55 : 0.12;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // The heart beats at the real heart rate; other zones breathe, faster when critical.
    const k = still ? 0.6 : id === 'heart' && heartRate > 0 ? 0.35 + 0.65 * beat(((t * heartRate) / 60) % 1) : status === 'nominal' ? 0.6 : 0.5 + 0.5 * Math.sin(t * (status === 'critical' ? 7 : 3));
    const boost = hovered || selected ? 1.35 : 1;
    // The halo is a soft pulse around a solid core: it swells and fades with each beat rather than sitting as a disc.
    if (halo.current) halo.current.scale.setScalar((0.55 + level * 0.45 + k * level * 0.75) * boost);
    if (haloMat.current) haloMat.current.opacity = Math.min(0.42, (0.03 + level * 0.34) * (1 - 0.65 * k) * boost);
    // A problem zone throws its colour onto the suit, so the chest itself turns coral, not just a dot.
    if (light.current) light.current.intensity = status === 'nominal' ? 0 : level * (3 + 7 * k);
    if (ring.current && !still) ring.current.rotation.z = t * 0.6;
  });

  return (
    <group position={ZONE_POS[id]}>
      <mesh>
        <sphereGeometry args={[status === 'nominal' ? 0.024 : status === 'watch' ? 0.04 : 0.052, 16, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.1, 20, 16]} />
        <meshBasicMaterial ref={haloMat} color={color} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
      </mesh>
      {(selected || hovered) && (
        <mesh ref={ring}>
          <ringGeometry args={[0.24, 0.258, 48, 1, 0, Math.PI * 1.6]} />
          <meshBasicMaterial color="#f5f2e9" transparent opacity={selected ? 1 : 0.7} depthTest={false} toneMapped={false} />
        </mesh>
      )}
      <pointLight ref={light} color={color} intensity={0} distance={1.3} decay={1.6} position={[0, 0, 0.3]} />
      {/* Generous invisible target so the zone is easy to point at */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onPick?.(id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(id);
        }}
        onPointerOut={() => onHover?.(null)}
      >
        <sphereGeometry args={[0.23, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A quick lub-dub envelope: 0 at rest, 1 at the peak of the first beat. */
function beat(phase: number) {
  const bump = (at: number, w: number) => Math.max(0, 1 - Math.abs(phase - at) / w);
  return Math.max(bump(0.06, 0.06), 0.55 * bump(0.24, 0.06));
}

function prepare(scene: Object3D) {
  const root = scene.clone(true);
  const stripes: MeshStandardMaterial[] = [];
  const materials: MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshStandardMaterial;
    // The export carries a second, overlapping copy of a few parts (an older suit revision). Drawing both
    // z-fights and wastes ~60k vertices, so the copies are dropped.
    if (/emusuit5_(jetpack2SG|lambert5SG|blinn1SG)/.test(src.name)) {
      mesh.visible = false;
      return;
    }
    // The file marks every material as fully transmissive (an export artefact), which would render the
    // suit as glass and cost an extra render pass. Rebuild them as plain, opaque PBR materials.
    const m = new MeshStandardMaterial({ name: src.name, color: src.color.clone(), map: src.map ?? null, roughness: 0.9, metalness: 0, side: src.side });
    // Warm the fabric a touch: pure white clips to a flat shape under the key light.
    if (!src.map && src.color.r > 0.85 && src.color.g > 0.85 && src.color.b > 0.85) m.color.set('#ebe7dc');
    if (/blinn3SG/.test(src.name)) {
      // Gold sun visor: the mirror that makes it read as a real helmet.
      m.color.set('#e0a63a');
      m.metalness = 1;
      m.roughness = 0.14;
      m.envMapIntensity = 1.7;
    } else if (/blinn1SG/.test(src.name)) {
      m.metalness = 0.6;
      m.roughness = 0.35;
    } else if (/blinn/.test(src.name)) {
      m.roughness = 0.55;
      m.metalness = 0.25;
    }
    if (/lambert4SG/.test(src.name)) stripes.push(m);
    materials.push(m);
    mesh.material = m;
  });
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  root.position.sub(center);
  return { root, scale: SUIT_HEIGHT / size.y, stripes, materials };
}

function Suit({ stripe, status, heartRate, interactive, still, onReady, zones, selectedZone, hoveredZone, onZonePick, onZoneHover }: SceneProps) {
  const { scene } = useGLTF(MODEL, DRACO);
  const suit = useMemo(() => prepare(scene), [scene]);
  const invalidate = useThree((s) => s.invalidate);
  const float = useRef<Group>(null);
  const lean = useRef({ x: 0, y: 0 });

  useEffect(() => () => suit.materials.forEach((m) => m.dispose()), [suit]);
  useEffect(() => {
    onReady?.();
  }, [onReady, suit]);
  // Stripes ease to the new crew colour so they settle with the readouts instead of snapping.
  const target = useRef(new Color(stripe));
  const first = useRef(true);
  useEffect(() => {
    target.current.set(stripe);
    if (still || first.current) suit.stripes.forEach((m) => m.color.copy(target.current));
    first.current = false;
    invalidate();
  }, [suit, stripe, still, invalidate]);
  useEffect(() => {
    invalidate();
  }, [status, heartRate, still, zones, selectedZone, hoveredZone, invalidate]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = float.current;
    if (!still) {
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
      suit.stripes.forEach((m) => m.color.lerp(target.current, k));
    }
    if (g) {
      if (still) {
        g.position.y = 0;
        g.rotation.set(0, interactive ? 0 : -0.35, 0);
      } else {
        // Microgravity drift: slow, never quite repeating.
        g.position.y = Math.sin(t * 0.55) * 0.07;
        g.rotation.x = Math.sin(t * 0.31 + 1) * 0.035;
        g.rotation.z = Math.sin(t * 0.43) * 0.04;
        if (!interactive) {
          // Lean toward the pointer, eased, on top of a slow sway.
          const ease = 1 - Math.exp(-Math.min(dt, 0.1) * 4);
          lean.current.x += (state.pointer.x - lean.current.x) * ease;
          lean.current.y += (state.pointer.y - lean.current.y) * ease;
          g.rotation.y = -0.2 + Math.sin(t * 0.22) * 0.22 + lean.current.x * 0.5;
          g.rotation.x += -lean.current.y * 0.14;
        }
      }
    }
  });

  return (
    <group ref={float}>
      {/* The model faces -Z in its file; turn it to the camera. */}
      <group rotation-y={Math.PI} scale={suit.scale}>
        <primitive object={suit.root} />
      </group>
      {(zones ?? [{ id: 'heart' as ZoneId, status }]).map((z) => (
        <Zone key={z.id} id={z.id} status={z.status} selected={selectedZone === z.id} hovered={hoveredZone === z.id} still={still} heartRate={heartRate} onPick={onZonePick} onHover={onZoneHover} />
      ))}
    </group>
  );
}

export default function AstronautScene(props: SceneProps) {
  const { interactive, stars, still, active } = props;
  return (
    <Canvas
      camera={{ position: [0, 0.05, 7.4], fov: 30, near: 0.1, far: 200 }}
      dpr={[1, 1.75]}
      frameloop={!active ? 'never' : still ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      {/* Sunlight is hard and white in orbit; the fill comes up blue from the Earth below. */}
      <ambientLight intensity={0.1} />
      {/* Warm key from upper right, as on the VitaCuff page */}
      <directionalLight position={[4, 5, 6]} intensity={1.75} color="#fff3dd" />
      {/* Earthshine from below */}
      <directionalLight position={[-3, -5, 2]} intensity={0.9} color="#4a86ff" />
      {/* Two cool rims from behind draw the edge of the helmet and both shoulders against the navy */}
      <directionalLight position={[-6, 3, -4]} intensity={2.2} color="#dfe6ff" />
      <directionalLight position={[6, 4, -5]} intensity={1.5} color="#dfe6ff" />
      <Suspense fallback={null}>
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2.2} position={[4, 4, 5]} scale={[5, 5, 1]} color="#fff3dd" />
          <Lightformer form="circle" intensity={1.6} position={[0, -6, 1]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} color="#2f6fe8" />
          <Lightformer form="rect" intensity={0.8} position={[-6, 1, -2]} rotation-y={Math.PI / 2} scale={[4, 8, 1]} color="#a8c6ff" />
        </Environment>
        <Suit {...props} />
      </Suspense>
      {stars && <Stars radius={60} depth={30} count={1400} factor={2.6} saturation={0} fade speed={still ? 0 : 0.4} />}
      {interactive && <OrbitControls makeDefault enablePan={false} minDistance={4.5} maxDistance={11} minPolarAngle={0.5} maxPolarAngle={2.6} autoRotate={!still} autoRotateSpeed={0.7} enableDamping={!still} />}
    </Canvas>
  );
}

useGLTF.preload(MODEL, DRACO);

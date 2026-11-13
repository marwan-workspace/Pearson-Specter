'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Stars, useGLTF } from '@react-three/drei';
import { Box3, Color, MeshStandardMaterial, Vector3, type Group, type Mesh, type Object3D, type PointLight } from 'three';
import type { Status } from '@/lib/types';

/**
 * The crew member's digital twin: NASA's own Extravehicular Mobility Unit model
 * (public domain, github.com/nasa/NASA-3D-Resources), floating in microgravity.
 *
 *  - the suit's ID stripes take the crew member's colour, the way real EVA suits tell astronauts apart;
 *  - the chest light beats at the live heart rate, in the crew member's status colour;
 *  - with reduced motion on, the suit holds a still pose and only re-renders when something changes.
 */
const MODEL = '/models/emu.glb';
const DRACO = '/draco/';
const SUIT_HEIGHT = 3.4;

const STATUS_COLOR: Record<Status, string> = { nominal: '#3ddc97', watch: '#ffb020', critical: '#fc3d21' };

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
    const m = new MeshStandardMaterial({ name: src.name, color: src.color.clone(), map: src.map ?? null, roughness: 0.86, metalness: 0, side: src.side });
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

function Suit({ stripe, status, heartRate, interactive, still, onReady }: SceneProps) {
  const { scene } = useGLTF(MODEL, DRACO);
  const suit = useMemo(() => prepare(scene), [scene]);
  const invalidate = useThree((s) => s.invalidate);
  const float = useRef<Group>(null);
  const lamp = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);
  const statusColor = STATUS_COLOR[status];

  useEffect(() => () => suit.materials.forEach((m) => m.dispose()), [suit]);
  useEffect(() => {
    onReady?.();
  }, [onReady, suit]);
  useEffect(() => {
    const c = new Color(stripe);
    suit.stripes.forEach((m) => m.color.copy(c));
    invalidate();
  }, [suit, stripe, invalidate]);
  useEffect(() => {
    invalidate();
  }, [status, heartRate, still, invalidate]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = float.current;
    if (g) {
      if (still) {
        g.position.y = 0;
        g.rotation.set(0, interactive ? 0 : -0.35, 0);
      } else {
        // Microgravity drift: slow, never quite repeating.
        g.position.y = Math.sin(t * 0.55) * 0.07;
        g.rotation.x = Math.sin(t * 0.31 + 1) * 0.035;
        g.rotation.z = Math.sin(t * 0.43) * 0.04;
        if (!interactive) g.rotation.y = -0.35 + Math.sin(t * 0.22) * 0.5;
      }
    }
    const k = still || heartRate <= 0 ? (heartRate > 0 ? 0.35 : 0) : beat(((t * heartRate) / 60) % 1);
    if (lamp.current) lamp.current.emissiveIntensity = heartRate > 0 ? 1.4 + k * 5 : 0.15;
    if (glow.current) glow.current.intensity = heartRate > 0 ? 0.25 + k * 2.2 : 0;
  });

  return (
    <group ref={float}>
      {/* The model faces -Z in its file; turn it to the camera. */}
      <group rotation-y={Math.PI} scale={suit.scale}>
        <primitive object={suit.root} />
      </group>
      {/* Chest light on the display and control module */}
      <group position={[0.02, 0.58, 0.47]}>
        <mesh>
          <sphereGeometry args={[0.034, 16, 12]} />
          <meshStandardMaterial ref={lamp} color={statusColor} emissive={statusColor} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        <pointLight ref={glow} color={statusColor} intensity={0.25} distance={1.6} decay={2} position={[0, 0, 0.12]} />
      </group>
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
      <ambientLight intensity={0.18} />
      <directionalLight position={[4, 5, 6]} intensity={1.9} />
      <directionalLight position={[-3, -5, 2]} intensity={1.1} color="#3f7dff" />
      <directionalLight position={[-5, 2, -5]} intensity={1.4} color="#c4d8ff" />
      <Suspense fallback={null}>
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2.6} position={[4, 4, 5]} scale={[5, 5, 1]} color="#ffffff" />
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

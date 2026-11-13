'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Status } from '@/lib/types';

const STATUS_COLOR: Record<Status, string> = { nominal: '#2fd27a', watch: '#ffb020', critical: '#fc3d21' };
const SUIT = '#eef1f6';
const SUIT_SHADE = '#c9d0dc';

interface Props {
  suitColor: string;
  visorTint: string;
  status: Status;
  heartRate: number;
  interactive?: boolean;
  stars?: boolean;
}

function Limb({ position, rotation = [0, 0, 0], radius, length, color = SUIT }: { position: [number, number, number]; rotation?: [number, number, number]; radius: number; length: number; color?: string }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[radius, length, 8, 16]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

function Ring({ position, rotation = [Math.PI / 2, 0, 0], radius, color }: { position: [number, number, number]; rotation?: [number, number, number]; radius: number; color: string }) {
  return (
    <mesh position={position} rotation={rotation}>
      <torusGeometry args={[radius, 0.035, 10, 32]} />
      <meshStandardMaterial color={color} roughness={0.4} />
    </mesh>
  );
}

function Suit({ suitColor, visorTint, status, heartRate, interactive }: Props) {
  const group = useRef<Group>(null);
  const heart = useRef<Mesh>(null);
  const ring = useRef<MeshStandardMaterial>(null);
  const lights = useRef<MeshStandardMaterial>(null);
  const sc = STATUS_COLOR[status];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = Math.sin(t * 0.9) * 0.07; // microgravity float
      if (!interactive) group.current.rotation.y = Math.sin(t * 0.35) * 0.55;
      group.current.rotation.z = Math.sin(t * 0.5) * 0.03;
    }
    // Heart beacon pulses at the live heart rate.
    const beat = (t * Math.max(30, heartRate)) / 60 % 1;
    const k = beat < 0.12 ? 1 - beat / 0.12 : 0;
    if (heart.current) heart.current.scale.setScalar(1 + k * 0.6);
    if (ring.current) ring.current.emissiveIntensity = 1.2 + Math.sin(t * (status === 'critical' ? 6 : 2)) * 0.5;
    if (lights.current) lights.current.emissiveIntensity = 1 + k * 1.5;
  });

  return (
    <group ref={group}>
      {/* Helmet + gold visor */}
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color={SUIT} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.07, 0.2]} scale={[0.95, 0.78, 0.72]}>
        <sphereGeometry args={[0.36, 32, 32]} />
        <meshStandardMaterial color={visorTint} metalness={0.95} roughness={0.12} />
      </mesh>
      <Ring position={[0, 0.68, 0]} radius={0.3} color={SUIT_SHADE} />

      {/* Torso */}
      <Limb position={[0, 0.2, 0]} radius={0.4} length={0.5} />
      {/* Chest display & control module */}
      <mesh position={[0, 0.22, 0.38]}>
        <boxGeometry args={[0.38, 0.24, 0.1]} />
        <meshStandardMaterial color="#1b2238" roughness={0.4} />
      </mesh>
      {[-0.1, 0, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.25, 0.44]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial ref={x === 0 ? lights : undefined} color={sc} emissive={sc} emissiveIntensity={1.2} />
        </mesh>
      ))}
      {/* Heart beacon */}
      <mesh ref={heart} position={[0.2, 0.48, 0.34]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#fc3d21" emissive="#fc3d21" emissiveIntensity={2} />
      </mesh>
      {/* Mission stripes in the crew colour */}
      <Ring position={[0, -0.12, 0]} radius={0.41} color={suitColor} />
      <mesh position={[-0.24, 0.5, 0.3]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.14, 0.1, 0.02]} />
        <meshStandardMaterial color={suitColor} />
      </mesh>

      {/* Life-support backpack */}
      <mesh position={[0, 0.28, -0.45]}>
        <boxGeometry args={[0.72, 0.85, 0.3]} />
        <meshStandardMaterial color={SUIT_SHADE} roughness={0.6} />
      </mesh>

      {/* Arms */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Limb position={[s * 0.55, 0.32, 0]} rotation={[0, 0, s * 0.45]} radius={0.14} length={0.36} />
          <Ring position={[s * 0.6, 0.22, 0]} rotation={[Math.PI / 2, 0, s * 0.45]} radius={0.15} color={suitColor} />
          <Limb position={[s * 0.68, -0.08, 0.12]} rotation={[0.5, 0, s * 0.15]} radius={0.12} length={0.32} />
          <mesh position={[s * 0.7, -0.32, 0.26]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={SUIT_SHADE} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Legs + boots */}
      {[-1, 1].map((s) => (
        <group key={`l${s}`}>
          <Limb position={[s * 0.19, -0.62, 0]} rotation={[0, 0, s * 0.06]} radius={0.17} length={0.42} />
          <Ring position={[s * 0.2, -0.82, 0]} radius={0.17} color={suitColor} />
          <Limb position={[s * 0.21, -1.08, 0.04]} radius={0.15} length={0.34} />
          <mesh position={[s * 0.22, -1.42, 0.08]}>
            <boxGeometry args={[0.26, 0.16, 0.4]} />
            <meshStandardMaterial color="#2a3150" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Status halo */}
      <mesh position={[0, -1.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.025, 12, 64]} />
        <meshStandardMaterial ref={ring} color={sc} emissive={sc} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

export default function AstronautScene(props: Props) {
  return (
    <Canvas camera={{ position: [0, -0.05, 5.6], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.7} />
      <pointLight position={[-3, 2, -2]} intensity={18} color="#4d8dff" />
      <pointLight position={[3, -1, -2]} intensity={8} color="#fc3d21" />
      {props.stars && <Stars radius={60} depth={30} count={1500} factor={3} fade speed={0.6} />}
      <Suit {...props} />
      {props.interactive && <OrbitControls enablePan={false} minDistance={3.5} maxDistance={8} autoRotate autoRotateSpeed={0.8} />}
    </Canvas>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useOnScreen, useReducedMotion } from '@/lib/hooks';
import type { Status } from '@/lib/types';
import type { ZoneId } from '@/lib/zones';

/** Client-only: WebGL cannot render on the server, and three.js stays out of the first page load. */
const Scene = dynamic(() => import('./AstronautScene'), { ssr: false });

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Unavailable() {
  return (
    <div className="grid h-full w-full place-items-center p-6 text-center">
      <p className="label max-w-[28ch]">The 3D suit view needs WebGL, which this browser has switched off. Every reading is still shown in the panels.</p>
    </div>
  );
}

export function Astronaut3D({ label, stripe, status, heartRate, interactive, stars, zones, selectedZone, hoveredZone, onZonePick, onZoneHover }: { label: string; stripe: string; status: Status; heartRate: number; interactive?: boolean; stars?: boolean; zones?: { id: ZoneId; status: Status }[]; selectedZone?: ZoneId | null; hoveredZone?: ZoneId | null; onZonePick?: (id: ZoneId) => void; onZoneHover?: (id: ZoneId | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const active = useOnScreen(box);
  const still = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(webglAvailable()), []);
  const onReady = useCallback(() => setReady(true), []);

  return (
    <div ref={box} className="relative h-full w-full" role="img" aria-label={label} style={{ cursor: hoveredZone ? 'pointer' : interactive ? 'grab' : undefined }}>
      {supported ? (
        <SceneBoundary fallback={<Unavailable />}>
          {!ready && (
            <div className="absolute inset-0 grid place-items-center" aria-hidden>
              <p className="label live-dot">Loading suit model</p>
            </div>
          )}
          <div className="h-full w-full transition-opacity duration-700 ease-out" style={{ opacity: ready ? 1 : 0 }}>
            <Scene stripe={stripe} status={status} heartRate={heartRate} interactive={interactive} stars={stars} still={still} active={active} onReady={onReady} zones={zones} selectedZone={selectedZone} hoveredZone={hoveredZone} onZonePick={onZonePick} onZoneHover={onZoneHover} />
          </div>
        </SceneBoundary>
      ) : (
        <Unavailable />
      )}
    </div>
  );
}

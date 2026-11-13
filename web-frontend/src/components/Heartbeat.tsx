'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Pause, Play, X } from 'lucide-react';
import { useMission } from '@/lib/mission';
import { byId } from '@/lib/crew';
import type { Astronaut } from '@/lib/types';
import { Panel, ago } from './ui';

/**
 * Feature 22 — heartbeat in a bottle. Family recordings are an open question in FEATURES.md,
 * so the demo synthesises a "lub-dub" at the family member's recorded rate with Web Audio.
 * Swap `beat()` for an <audio> element playing the real recording.
 */
function useHeartbeatAudio(bpm: number, playing: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (!ctx.current) ctx.current = new AudioContext();
    const ac = ctx.current;
    const thump = (t: number, freq: number, gain: number) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.2);
    };
    const beat = () => {
      const t = ac.currentTime + 0.02;
      thump(t, 70, 0.9); // lub
      thump(t + 0.24, 58, 0.6); // dub
    };
    void ac.resume().then(() => setBlocked(ac.state !== 'running'));
    beat();
    const id = setInterval(beat, 60_000 / bpm);
    return () => clearInterval(id);
  }, [bpm, playing]);
  return { blocked, resume: () => ctx.current?.resume().then(() => setBlocked(false)) };
}

/** Floating player shown on every screen when stress triggers playback. */
export function HeartbeatPlayer() {
  const { s, dispatch } = useMission();
  const hb = s.heartbeat;
  const a = hb ? byId(hb.astronautId) : undefined;
  const member = a?.family[hb!.member];
  const [paused, setPaused] = useState(false);
  const { blocked, resume } = useHeartbeatAudio(member?.bpm ?? 70, !!member && !paused);
  useEffect(() => setPaused(false), [hb?.at]);
  if (!hb || !a || !member) return null;
  return (
    <aside role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] panel border-nasa-red/60 p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <Heart className="size-10 shrink-0 fill-nasa-red text-nasa-red" style={{ animation: paused ? undefined : `hb ${60 / member.bpm}s ease-in-out infinite` }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Feature 22 · Heartbeat in a bottle</p>
          <p className="font-semibold">For {a.name.split(' ')[0]}: {member.name}’s heartbeat</p>
          <p className="text-xs text-text-2">Recorded by {a.name.split(' ')[0]}’s {member.relation} before launch · <span className="num">{member.bpm} bpm</span></p>
          <p className="mt-1 text-xs text-text-3">Triggered by stress spike: {hb.reason}</p>
        </div>
        <button className="btn btn-ghost min-h-10 px-2" aria-label="Stop heartbeat" onClick={() => dispatch({ type: 'heartbeat-stop' })}><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex gap-2">
        {blocked ? (
          <button className="btn btn-red flex-1" onClick={() => void resume()}><Play className="size-4" aria-hidden /> Tap to play heartbeat</button>
        ) : (
          <button className="btn btn-ghost flex-1" onClick={() => setPaused((p) => !p)}>{paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />} {paused ? 'Play' : 'Pause'}</button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-text-3">Demo audio is synthesised. Real family recordings are still an open question.</p>
    </aside>
  );
}

/** Astronaut-page section: available recordings + last trigger. */
export function HeartbeatSection({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const last = s.decisions.find((d) => d.astronautId === a.id && d.decision.includes('recorded heartbeat'));
  return (
    <Panel id="heartbeat" feature="Feature 22 · Heartbeat in a bottle" title="Heartbeat from home" icon={<Heart className="size-5 fill-nasa-red text-nasa-red" aria-hidden />}>
      <p className="mb-3 text-sm text-text-2">
        There is no live call home from Mars. When the watch detects a stress spike, the dashboard plays a heartbeat recorded by family before launch.
        {last ? <> Last played {ago(last.at, s.now)}.</> : ' Not triggered yet.'}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {a.family.map((m, i) => (
          <li key={m.name} className="flex items-center gap-3 rounded-xl border border-line bg-space-0/40 p-3">
            <Heart className="size-6 text-nasa-red" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold">{m.name} <span className="font-normal text-text-3">({m.relation})</span></p>
              <p className="num text-xs text-text-3">{m.bpm} bpm · recorded pre-launch</p>
            </div>
            <button className="btn btn-ghost" onClick={() => dispatch({ type: 'heartbeat', astronautId: a.id, member: i, reason: 'played manually' })}>
              <Play className="size-4" aria-hidden /> Play
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

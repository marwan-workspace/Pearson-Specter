'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FlaskConical, Globe2, WifiOff } from 'lucide-react';
import { useMission } from '@/lib/mission';
import { SimulatorPanel } from './SimulatorPanel';

function Clock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="num text-text-3">--:--:--</span>;
  return (
    <span className="num text-lg font-semibold tracking-wide" aria-label="UTC time">
      {new Date(now).toISOString().slice(11, 19)} <span className="text-xs text-text-3">UTC</span>
    </span>
  );
}

export function Header() {
  const { s, dispatch } = useMission();
  const [sim, setSim] = useState(false);
  const queued = s.reports.filter((r) => r.delivery === 'queued').length;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-space-0/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Crew overview">
          <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
            <circle cx="20" cy="20" r="18" fill="#0B3D91" />
            <ellipse cx="20" cy="20" rx="17" ry="6" fill="none" stroke="#fff" strokeWidth="1.4" transform="rotate(-28 20 20)" />
            <path d="M8 26 L20 17 L32 12" stroke="#FC3D21" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="13" cy="12" r="1" fill="#fff" /><circle cx="27" cy="27" r="1" fill="#fff" />
          </svg>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[0.18em]">CREW HEALTH</p>
            <p className="text-[11px] text-text-3">Space Apps · Vitals monitoring</p>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Clock />
          <button
            type="button"
            onClick={() => dispatch({ type: 'earth-link', on: !s.earthLink })}
            className={`btn h-10 min-h-10 border px-3 text-xs ${s.earthLink ? 'border-nominal/40 text-nominal' : 'border-watch/60 bg-watch/10 text-watch'}`}
            aria-pressed={s.earthLink}
            title="Feature 18: works without Earth contact. Select to toggle the link (demo)."
          >
            {s.earthLink ? <Globe2 className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
            {s.earthLink ? 'Earth link' : 'No Earth contact'}
            {queued > 0 && <span className="num rounded bg-watch px-1.5 text-[10px] text-black">{queued} queued</span>}
          </button>
          <button type="button" className="btn btn-ghost h-10 min-h-10 px-3 text-xs" onClick={() => setSim((v) => !v)} aria-expanded={sim}>
            <FlaskConical className="size-4" aria-hidden /> Simulator
          </button>
        </div>
      </div>
      {sim && <SimulatorPanel onClose={() => setSim(false)} />}
    </header>
  );
}

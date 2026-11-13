'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { FlaskConical, Globe2, Sparkles, WifiOff } from 'lucide-react';
import { astronautStatus, useMission } from '@/lib/mission';
import { useBackend } from '@/lib/backend';
import { useDismiss, useNow } from '@/lib/hooks';
import { CREW } from '@/lib/crew';
import { STATUS_META, firstName, initials } from './ui';
import { SimulatorPanel } from './SimulatorPanel';
import { ConnectionPanel } from './ConnectionPanel';

function Clock() {
  const now = useNow();
  return (
    <p className="num hidden items-baseline gap-1.5 text-sm font-semibold md:flex" aria-label="Coordinated universal time">
      <span className="min-w-[8ch]">{now ? new Date(now).toISOString().slice(11, 19) : '--:--:--'}</span>
      <span className="label">UTC</span>
    </p>
  );
}

/** Original mark: an orbit and a pulse. Not the NASA insignia, which may not be used without permission. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--nasa-blue)" />
      <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" transform="rotate(-24 16 16)" />
      <path d="M5 17h6l2.2-6 3.6 11 2.6-7.5 1.4 2.5H27" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Pop = 'sim' | 'agent' | null;

export function Header() {
  const { s, dispatch } = useMission();
  const backend = useBackend();
  const path = usePathname();
  const [pop, setPop] = useState<Pop>(null);
  const panel = useRef<HTMLDivElement>(null);
  const simBtn = useRef<HTMLButtonElement>(null);
  const agentBtn = useRef<HTMLButtonElement>(null);
  useDismiss(pop !== null, () => setPop(null), panel, pop === 'sim' ? simBtn : agentBtn);

  const queued = s.reports.filter((r) => r.delivery === 'queued').length;
  const agent = backend.status === 'live' ? { label: 'Gemini live', cls: 'border-agent/45 text-agent' } : backend.status === 'checking' ? { label: 'Checking agent', cls: 'border-line-strong text-text-2' } : { label: 'Simulated agent', cls: 'border-line-strong text-text-2' };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-space-0/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-3 px-4 md:gap-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-[4px]" aria-label="Crew Health, crew overview">
          <Mark />
          <span className="display hidden text-[15px] sm:block">Crew Health</span>
        </Link>

        {/* Jump straight to any crew member's record from anywhere */}
        <nav aria-label="Crew" className="hidden items-center gap-1 lg:flex">
          {CREW.map((c) => {
            const st = s.ready ? astronautStatus(s, c.id).status : 'nominal';
            const current = path === `/astronaut/${c.id}`;
            const I = STATUS_META[st].icon;
            return (
              <Link
                key={c.id}
                href={`/astronaut/${c.id}`}
                aria-current={current ? 'page' : undefined}
                className={clsx('flex h-9 items-center gap-2 rounded-[4px] px-2.5 text-sm transition-colors duration-150', current ? 'bg-space-2 text-ink' : 'text-text-2 hover:bg-space-2 hover:text-ink')}
              >
                <span className="grid size-6 place-items-center rounded-full bg-space-3 text-[10px] font-bold" aria-hidden>{initials(c.name)}</span>
                {firstName(c.name)}
                {s.ready && <I className="size-3.5" style={{ color: STATUS_META[st].color }} aria-label={STATUS_META[st].label} strokeWidth={2.5} />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Clock />
          <button
            type="button"
            onClick={() => dispatch({ type: 'earth-link', on: !s.earthLink })}
            className={clsx('btn btn-sm border', s.earthLink ? 'border-line-strong text-text-2 hover:bg-space-2 hover:text-ink' : 'border-watch/60 bg-watch/10 text-watch')}
            aria-pressed={s.earthLink}
            title="Switch Earth contact on or off. Reports queue while it is off."
          >
            {s.earthLink ? <Globe2 className="size-4 text-nominal" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{s.earthLink ? 'Earth link' : 'No Earth contact'}</span>
            <span className="sr-only sm:hidden">{s.earthLink ? 'Earth link on' : 'No Earth contact'}</span>
            {queued > 0 && <span className="num rounded-[3px] bg-watch px-1.5 text-xs font-bold text-black">{queued} queued</span>}
          </button>
          <button ref={agentBtn} type="button" className={clsx('btn btn-sm border hover:bg-space-2', agent.cls)} onClick={() => setPop((p) => (p === 'agent' ? null : 'agent'))} aria-expanded={pop === 'agent'} aria-haspopup="dialog">
            <Sparkles className="size-4" aria-hidden />
            <span className="hidden sm:inline">{agent.label}</span>
            <span className="sr-only sm:hidden">{agent.label}. Open agent connection.</span>
            {backend.status === 'live' && <span className="live-dot size-1.5 rounded-full bg-agent" aria-hidden />}
          </button>
          <button ref={simBtn} type="button" className="btn btn-sm btn-ghost" onClick={() => setPop((p) => (p === 'sim' ? null : 'sim'))} aria-expanded={pop === 'sim'} aria-haspopup="dialog">
            <FlaskConical className="size-4" aria-hidden />
            <span className="hidden sm:inline">Simulator</span>
            <span className="sr-only sm:hidden">Open simulator</span>
          </button>
        </div>
      </div>
      {pop && (
        <div className="relative mx-auto max-w-[1680px]">
          <div ref={panel} className="pop-in panel absolute right-4 top-2 z-50 w-[min(440px,calc(100vw-2rem))] border-line-strong bg-space-1 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.7)] md:right-8">
            {pop === 'sim' ? <SimulatorPanel onClose={() => setPop(null)} /> : <ConnectionPanel onClose={() => setPop(null)} />}
          </div>
        </div>
      )}
    </header>
  );
}

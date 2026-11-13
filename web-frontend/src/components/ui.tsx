'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReveal } from '@/lib/hooks';
import { CircleCheck, OctagonAlert, Sparkles, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import type { Status } from '@/lib/types';

export const STATUS_META: Record<Status, { label: string; color: string; icon: typeof CircleCheck; cls: string }> = {
  nominal: { label: 'Nominal', color: 'var(--nominal)', icon: CircleCheck, cls: 'text-nominal' },
  watch: { label: 'Watch', color: 'var(--watch)', icon: TriangleAlert, cls: 'text-watch' },
  critical: { label: 'Critical', color: 'var(--critical)', icon: OctagonAlert, cls: 'text-critical' },
};

/**
 * Status is a symbol with its own shape (tick in a circle, triangle, octagon) plus a word, so it reads
 * without colour. Only critical gets a filled tag: one loud thing on the screen, not a row of pills.
 */
export function StatusPill({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status];
  const I = m.icon;
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 font-bold',
        size === 'sm' ? 'text-sm' : 'text-base',
        status === 'critical' ? 'pulse-critical rounded-[4px] bg-critical px-2 py-0.5 text-[#2a0806]' : m.cls,
      )}
    >
      <I className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden strokeWidth={2.5} /> {m.label}
    </span>
  );
}

/** Section container. `feature` keeps the link to FEATURES.md without shouting about it. */
export function Panel({ title, icon, children, right, className, id, feature, lead }: { title: ReactNode; icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string; id?: string; feature?: string; lead?: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id={id} className={clsx('panel on-scroll p-4 md:p-6', className)} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id ? `${id}-h` : undefined} className="title flex items-center gap-2 text-lg">
            {icon}
            {title}
          </h2>
          {lead && <p className="mt-1 max-w-[70ch] text-sm text-text-2">{lead}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {right}
          {feature && <span className="label" title="Feature numbers in FEATURES.md">{feature}</span>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, tone, sub }: { label: string; value: ReactNode; unit?: string; tone?: Status; sub?: ReactNode }) {
  const off = tone && tone !== 'nominal';
  const I = off ? STATUS_META[tone].icon : null;
  return (
    <div className="border-t border-line pt-2">
      <p className="label flex items-center gap-1">
        {label}
        {I && <I className="size-3.5" style={{ color: STATUS_META[tone!].color }} aria-label={STATUS_META[tone!].label} />}
      </p>
      <p className="num mt-0.5 whitespace-nowrap text-2xl font-semibold leading-tight" style={off ? { color: STATUS_META[tone].color } : undefined}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-text-2">{unit}</span>}
      </p>
      {sub && <p className="label mt-0.5">{sub}</p>}
    </div>
  );
}

/** The fill grows with a transform (compositor only), not with width. */
export function Meter({ value, max, color = 'var(--chart-1)', label }: { value: number; max: number; color?: string; label: string }) {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-space-3" role="meter" aria-label={label} aria-valuenow={Number(value.toFixed(2))} aria-valuemin={0} aria-valuemax={max}>
      <div className="meter-fill h-full w-full rounded-full" style={{ transform: `scaleX(${k})`, background: color }} />
    </div>
  );
}

/** Who wrote an agent message: the Gemini backend or the local stand-in. */
export function SourceTag({ source }: { source?: 'gemini' | 'simulated' }) {
  if (!source) return null;
  return source === 'gemini' ? (
    <span className="label inline-flex items-center gap-1 text-agent"><Sparkles className="size-3" aria-hidden /> Gemini</span>
  ) : (
    <span className="label">Simulated</span>
  );
}

/** Inline notice inside a panel. */
export function Notice({ tone, icon, children, role }: { tone: Status | 'info'; icon?: ReactNode; children: ReactNode; role?: 'alert' | 'status' }) {
  const cls = tone === 'info' ? 'border-line-strong text-text-2' : tone === 'nominal' ? 'border-nominal text-nominal' : tone === 'watch' ? 'border-watch text-watch' : 'border-critical bg-critical-surface text-ink';
  return (
    <p role={role} className={clsx('flex items-start gap-2 border-l-2 py-1 pl-3 pr-2 text-sm', cls)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A one-off wash of the new status colour over its row when the status changes (never on first paint). */
export function StatusFlash({ status }: { status: Status }) {
  const prev = useRef(status);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current === status) return;
    prev.current = status;
    setTick((t) => t + 1);
  }, [status]);
  if (tick === 0) return null;
  return <span key={tick} aria-hidden className="flash pointer-events-none absolute inset-0" style={{ background: STATUS_META[status].color }} />;
}

export function scoreTone(score: number): Status {
  return score >= 75 ? 'nominal' : score >= 55 ? 'watch' : 'critical';
}

export const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16);
export const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
export const firstName = (name: string) => name.split(' ')[0];
export const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

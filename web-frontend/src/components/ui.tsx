'use client';

import type { ReactNode } from 'react';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import type { Status } from '@/lib/types';

export const STATUS_META: Record<Status, { label: string; color: string; icon: typeof CircleCheck; cls: string }> = {
  nominal: { label: 'Nominal', color: 'var(--nominal)', icon: CircleCheck, cls: 'text-nominal border-nominal/50 bg-nominal/10' },
  watch: { label: 'Watch', color: 'var(--watch)', icon: TriangleAlert, cls: 'text-watch border-watch/50 bg-watch/10' },
  critical: { label: 'Critical', color: 'var(--critical)', icon: OctagonAlert, cls: 'text-critical border-critical/60 bg-critical/15' },
};

export function StatusPill({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status];
  const I = m.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wider', size === 'sm' ? 'h-6 px-2 text-[10px]' : 'h-8 px-3 text-xs', m.cls, status === 'critical' && 'pulse-red')}>
      <I className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden strokeWidth={2.5} /> {m.label}
    </span>
  );
}

export function Panel({ title, icon, children, right, className, id, feature }: { title: ReactNode; icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string; id?: string; feature?: string }) {
  return (
    <section id={id} className={clsx('panel scroll-mt-28 p-4 md:p-5', className)} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          {feature && <p className="eyebrow">{feature}</p>}
          <h2 id={id ? `${id}-h` : undefined} className="flex items-center gap-2 text-lg font-semibold">
            {icon}
            {title}
          </h2>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, tone, sub }: { label: string; value: ReactNode; unit?: string; tone?: Status; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-space-0/40 px-3 py-2">
      <p className="text-[11px] font-medium text-text-3">{label}</p>
      <p className="num text-xl font-semibold" style={tone && tone !== 'nominal' ? { color: STATUS_META[tone].color } : undefined}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-text-3">{unit}</span>}
      </p>
      {sub && <p className="text-[11px] text-text-3">{sub}</p>}
    </div>
  );
}

export function Meter({ value, max, color = 'var(--chart-1)', label }: { value: number; max: number; color?: string; label: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-space-3" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

export function scoreTone(score: number): Status {
  return score >= 75 ? 'nominal' : score >= 55 ? 'watch' : 'critical';
}

export const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16);
export const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

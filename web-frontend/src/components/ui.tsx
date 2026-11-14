'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { CircleCheck, CircleDot, Info, LoaderCircle, Moon, RefreshCw, Sun, TriangleAlert, Zap, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/lib/types';
import { toneOf, words } from '@/lib/format';

const TONE_VAR: Record<Tone, string> = {
  nominal: 'var(--status-nominal)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
  fault: 'var(--status-fault)',
  info: 'var(--accent-cobalt)',
  neutral: 'var(--text-secondary)',
};
// The status colours have their own glow tokens; the rest get a tint of their colour from the .pill rule.
const TONE_GLOW: Partial<Record<Tone, string>> = {
  nominal: 'var(--status-nominal-glow)',
  warning: 'var(--status-warning-glow)',
  critical: 'var(--status-critical-glow)',
  fault: 'var(--status-fault-glow)',
};
// Status never rides on colour alone: each tone has its own symbol next to the word.
const TONE_ICON: Record<Tone, LucideIcon> = { nominal: CircleCheck, warning: TriangleAlert, critical: TriangleAlert, fault: Zap, info: Info, neutral: CircleDot };

export function Pill({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: LucideIcon | null }) {
  const Icon = icon === null ? null : (icon ?? TONE_ICON[tone]);
  return (
    <span className="pill" style={{ '--tone': TONE_VAR[tone], ...(TONE_GLOW[tone] ? { '--tone-glow': TONE_GLOW[tone] } : {}) } as CSSProperties}>
      {Icon && <Icon className="size-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

/** A status word from the backend ("awaiting_confirmation") as a pill in its colour role. */
export function StatusPill({ status }: { status: string | null | undefined }) {
  return <Pill tone={toneOf(status)}>{words(status)}</Pill>;
}

/** Saved: a ring draws itself, then the tick. Decorative; the words beside it say what happened. */
export function AnimatedCheck({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle className="check-ring" cx="12" cy="12" r="10" />
      <path className="check-tick" d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <LoaderCircle className={`spin ${className}`} aria-hidden />;
}

export function Panel({ title, icon: Icon, iconMotion = '', count, action, children, className = '', i = 0 }: {
  title: string; icon?: LucideIcon; iconMotion?: '' | 'beat' | 'breathe'; count?: number; action?: ReactNode; children: ReactNode; className?: string; i?: number;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`panel settle flex min-w-0 flex-col ${className}`} style={{ '--i': i } as CSSProperties}>
      <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-hairline px-4 py-2 md:px-5">
        <h2 id={id} className="title flex min-w-0 items-center gap-2 text-base">
          {Icon && <Icon className={`size-4 shrink-0 text-accent ${iconMotion}`} aria-hidden />}
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="num label rounded-full bg-elevated px-2 py-0.5">{count}</span>}
        </h2>
        {action}
      </header>
      <div className="min-w-0 flex-1 p-4 md:p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      <Icon className="mb-1 size-6 text-muted" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-[40ch] text-sm text-secondary">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="alert-in critical-surface flex flex-wrap items-center gap-3 px-4 py-3">
      <TriangleAlert className="size-5 shrink-0 text-critical" aria-hidden />
      <p className="min-w-0 flex-1 text-sm"><b className="font-semibold">Something went wrong.</b> {message}</p>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={onRetry}><RefreshCw className="size-4" aria-hidden />Try again</button>}
    </div>
  );
}

export interface Notice { tone: Tone; text: string }

/** One transient message at the bottom of the screen. Errors stay until dismissed; the rest leave after 5 s. */
export function Toast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose; // callers pass a new function each render; only a new notice may restart the timer
  useEffect(() => {
    if (!notice || notice.tone === 'critical') return;
    const t = setTimeout(() => close.current(), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {notice && (
        <div role={notice.tone === 'critical' ? 'alert' : 'status'} className="pop-in hud pointer-events-auto flex max-w-lg items-center gap-3 px-4 py-3 text-sm" style={{ '--origin': 'bottom center' } as CSSProperties}>
          <span style={{ color: TONE_VAR[notice.tone] }}>{notice.tone === 'nominal' ? <AnimatedCheck /> : (() => { const I = TONE_ICON[notice.tone]; return <I className="size-5" aria-hidden />; })()}</span>
          <p className="min-w-0 flex-1">{notice.text}</p>
          <button className="btn btn-sm btn-quiet" onClick={onClose}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Placeholder rows while a list loads; reserves the height so the page does not jump. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

export function Avatar({ name, size = 'size-10' }: { name: string; size?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-sm font-bold [font-stretch:90%]`}>{initials}</span>;
}

export interface TabDef { id: string; label: string; icon: LucideIcon; badge?: number; motion?: 'beat' | 'breathe' }

/** Tab list with arrow-key movement. The panels are rendered by the caller with role="tabpanel". */
export function Tabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === value);
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 md:mx-0 md:px-0">
      {tabs.map((t) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={t.id === value} aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1} className="tab" onClick={() => onChange(t.id)}>
          <t.icon className={`size-4 ${t.id === value ? (t.motion ?? '') : ''}`} aria-hidden />
          {t.label}
          {!!t.badge && <span className="num rounded-full bg-critical-glow px-1.5 text-xs text-critical">{t.badge}<span className="sr-only"> need attention</span></span>}
        </button>
      ))}
    </div>
  );
}

/** A trend line for the last readings. Decorative next to the number it sits beside, so it is hidden from screen readers. */
export function Sparkline({ values, color = 'var(--accent-cyan)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="h-10" aria-hidden />;
  const w = 160, h = 40, pad = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

/** A button that asks once more before a consequential action: the first press arms it, the second confirms. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className = 'btn btn-ghost', disabled }: {
  children: ReactNode; confirmLabel: string; onConfirm: () => void; className?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={armed ? 'btn btn-danger' : className} disabled={disabled} onBlur={() => setArmed(false)}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </button>
  );
}

type Theme = 'dark' | 'light';

/** Dark by default (a cockpit at night); the choice is remembered. layout.tsx applies it before first paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('crew-health-theme', next); } catch { /* private mode: the choice lasts for this page */ }
    setTheme(next);
  }
  return (
    <button className="btn btn-icon btn-quiet" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}

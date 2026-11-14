import type { Tone } from './types';

/** "radiation_sickness" -> "Radiation sickness" */
export const words = (s: string | null | undefined) => {
  const t = String(s ?? '').replace(/[_-]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '—';
};

export const num = (v: unknown, digits = 0) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');

export const dateTime = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const clock = (v: unknown) => (v ? new Date(String(v)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');

/** "just now", "40 s ago", "12 min ago", "3 h ago", then a date. `now` is passed in so lists re-render on a shared tick. */
export function timeAgo(v: unknown, now = Date.now()) {
  if (!v) return '—';
  const s = Math.max(0, Math.round((now - Date.parse(String(v))) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dateTime(v);
}

/** The watch writes once a minute; a reading older than this is shown as stale, not live. */
export const STALE_MS = 3 * 60_000;
export const isStale = (v: unknown, now = Date.now()) => !v || now - Date.parse(String(v)) > STALE_MS;

const TONES: Record<string, Tone> = {
  // condition severity
  low: 'neutral', moderate: 'warning', high: 'warning', critical: 'critical',
  // condition status
  open: 'critical', monitoring: 'warning', resolved: 'nominal', false_alarm: 'neutral',
  // decisions
  proposed: 'warning', accepted: 'nominal', rejected: 'neutral', cancelled: 'neutral', completed: 'nominal', superseded: 'neutral',
  // medication events
  awaiting_confirmation: 'warning', confirmed: 'info', administered: 'nominal', crew_action_required: 'critical', declined: 'neutral', unavailable: 'neutral',
  // plans and items
  draft: 'neutral', awaiting_approval: 'warning', approved: 'nominal', active: 'info', planned: 'neutral', in_progress: 'info', skipped: 'neutral',
  // urgency
  routine: 'neutral', urgent: 'warning', emergency: 'critical',
  // reports and alerts
  queued: 'warning', sent: 'info', replied: 'nominal', pending: 'critical', acknowledged: 'warning',
  // check-ins
  missed: 'warning', incomplete: 'warning',
};
/** Status word -> colour role. Unknown words stay neutral rather than guessing. */
export const toneOf = (status: string | null | undefined): Tone => TONES[String(status)] ?? 'neutral';

'use client';

import { Check, RefreshCw, X } from 'lucide-react';
import { useBackend, type AgentPreference } from '@/lib/backend';

const MODE_LABEL = { python: 'Python bridge (python -m overview)', http: 'HTTP backend', off: 'Switched off' } as const;

/**
 * Where the dashboard meets the backend. Shows whether the Gemini-backed agent is reachable,
 * exactly what is missing if it is not, and lets a demo force the local simulation.
 */
export function ConnectionPanel({ onClose }: { onClose: () => void }) {
  const b = useBackend();
  const h = b.health;
  const headline = b.status === 'live' ? 'Replies come from Gemini.' : b.status === 'checking' ? 'Checking the backend.' : b.preference === 'simulated' ? 'Simulation chosen. Replies come from local rules.' : 'Backend not ready. Replies come from local rules.';

  return (
    <div role="dialog" aria-label="Agent connection">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="title text-base">Agent connection</h2>
          <p className="mt-0.5 text-sm text-text-2" role="status">{headline}</p>
        </div>
        <button className="btn btn-sm btn-quiet px-2" onClick={onClose} aria-label="Close agent connection" autoFocus><X className="size-4" aria-hidden /></button>
      </div>

      <fieldset className="mb-4">
        <legend className="label mb-1.5">Who answers the chat, check-in, analysis and weekly report</legend>
        <div className="grid grid-cols-2 gap-1 rounded-[4px] bg-space-0 p-1">
          {(['auto', 'simulated'] as AgentPreference[]).map((p) => (
            <label key={p} className={`flex min-h-10 items-center justify-center rounded-[3px] px-2 text-center text-sm font-semibold transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-nasa-bright ${b.preference === p ? 'bg-space-3 text-ink' : 'text-text-3 hover:text-ink'}`}>
              <input type="radio" name="agent-pref" className="sr-only" checked={b.preference === p} onChange={() => b.setPreference(p)} />
              {p === 'auto' ? 'Gemini when ready' : 'Simulation only'}
            </label>
          ))}
        </div>
      </fieldset>

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="label">Route</dt>
        <dd>{h ? MODE_LABEL[h.mode] : b.checking ? 'Checking' : 'Dashboard server not reachable'}</dd>
        <dt className="label">Model</dt>
        <dd className="num">{h?.model ?? 'Chosen by the backend (GEMINI_MODEL)'}</dd>
      </dl>

      {h && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {h.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-nominal" aria-label="Ready" strokeWidth={2.5} /> : <X className="mt-0.5 size-4 shrink-0 text-watch" aria-label="Missing" strokeWidth={2.5} />}
              <span className="min-w-0">
                {c.label}
                {!c.ok && c.hint && <span className="block text-text-3">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {b.lastError && (
        <p className="mb-3 rounded-[4px] border border-watch px-3 py-2 text-sm text-watch" role="alert">
          Last call failed: {b.lastError} The simulation answered instead.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="label max-w-[30ch]">The key stays on the server in the repo&rsquo;s .env file and is never sent to this page.</p>
        <button className="btn btn-sm btn-ghost" onClick={() => void b.refresh()} disabled={b.checking}>
          <RefreshCw className={`size-4 ${b.checking ? 'animate-spin' : ''}`} aria-hidden /> {b.checking ? 'Checking' : 'Check again'}
        </button>
      </div>
    </div>
  );
}

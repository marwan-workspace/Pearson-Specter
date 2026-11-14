'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MessagesSquare, Send } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { clock } from '@/lib/format';
import { EmptyState, Spinner } from './ui';

/** A conversation with the manager agent. Keeps its own draft, follows new messages, and shows when the agent is writing. */
export function AgentChat({ label, messages, busy, onSend, emptyTitle, emptyHint, placeholder }: {
  label: string; messages: ChatMessage[]; busy: boolean; onSend: (text: string) => void; emptyTitle: string; emptyHint: string; placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const draftId = useId();
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages.length, busy]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    onSend(text);
  }

  return (
    <div className="flex h-[420px] flex-col">
      <div ref={log} role="log" aria-label={label} aria-live="polite" tabIndex={0} className="well flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !busy ? <EmptyState icon={MessagesSquare} title={emptyTitle} hint={emptyHint} /> : (
          <ol className="grid gap-2">
            {messages.map((m, i) => (
              <li key={`${m.at}-${i}`} className={`settle flex flex-col ${m.from === 'astronaut' ? 'items-end' : 'items-start'}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-panel)] px-3 py-2 text-sm ${m.from === 'astronaut' ? 'bg-accent text-on-accent' : 'border border-hairline bg-glass'}`}>
                  <span className="sr-only">{m.from === 'astronaut' ? 'You: ' : 'Agent: '}</span>{m.text}
                </p>
                <span className="label mt-0.5 px-1">{m.from === 'astronaut' ? 'You' : 'Agent'} · {clock(m.at)}</span>
              </li>
            ))}
            {busy && <li className="fade-in flex items-center gap-2 text-violet"><span className="typing" aria-hidden><i /><i /><i /></span><span className="label">The agent is writing…</span></li>}
          </ol>
        )}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={draftId}>{placeholder}</label>
        <input id={draftId} className="input min-w-0 flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} autoComplete="off" maxLength={2000} />
        <button className="btn btn-primary" disabled={busy || !draft.trim()}>
          {busy ? <Spinner /> : <Send className="size-4" aria-hidden />}
          <span className="hidden sm:inline">Send</span><span className="sr-only sm:hidden">Send</span>
        </button>
      </form>
    </div>
  );
}

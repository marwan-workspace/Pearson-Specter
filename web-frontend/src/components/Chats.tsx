'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { useMission } from '@/lib/mission';
import type { Astronaut, CheckInMessage } from '@/lib/types';
import { fmtTime } from './ui';

function Thread({ messages, name }: { messages: CheckInMessage[]; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);
  return (
    <div ref={ref} className="flex max-h-[360px] min-h-[200px] flex-col gap-2.5 overflow-y-auto pr-1" aria-live="polite">
      {messages.map((m, i) =>
        m.from === 'agent' ? (
          <div key={i} className="flex max-w-[88%] gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-agent/20 text-agent"><Bot className="size-4" aria-hidden /></span>
            <div className="rounded-2xl rounded-tl-sm border border-agent/40 bg-agent/10 px-3 py-2 text-sm">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-agent">Agent · {fmtTime(m.at)}</p>
              {m.text}
            </div>
          </div>
        ) : (
          <div key={i} className="ml-auto flex max-w-[88%] flex-row-reverse gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-nasa-blue text-white"><User className="size-4" aria-hidden /></span>
            <div className="rounded-2xl rounded-tr-sm bg-nasa-blue/60 px-3 py-2 text-sm">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-2">{name} · {fmtTime(m.at)}</p>
              {m.text}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Composer({ onSend, placeholder, disabled }: { onSend: (t: string) => void; placeholder: string; disabled?: boolean }) {
  const [t, setT] = useState('');
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!t.trim()) return;
        onSend(t.trim());
        setT('');
      }}
    >
      <label className="sr-only" htmlFor={placeholder}>{placeholder}</label>
      <input id={placeholder} value={t} onChange={(e) => setT(e.target.value)} disabled={disabled} placeholder={placeholder} autoComplete="off" className="h-11 flex-1 rounded-xl border border-line-strong bg-space-2 px-3 text-sm placeholder:text-text-3" />
      <button className="btn btn-primary" disabled={disabled || !t.trim()} aria-label="Send"><Send className="size-4" /></button>
    </form>
  );
}

/** Feature 5 — ~3-minute daily check-in; asks for yesterday if missed; feeds sleep, mental health, root cause. */
export function CheckInChat({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const ci = s.checkins[a.id];
  const first = a.name.split(' ')[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
      <div>
        <Thread messages={ci.messages} name={first} />
        <Composer onSend={(text) => dispatch({ type: 'checkin', id: a.id, text })} placeholder={`Answer as ${first}…`} />
      </div>
      <aside className="flex flex-col gap-2 text-sm">
        <p className={`rounded-xl border p-3 ${ci.completed ? 'border-nominal/50 bg-nominal/10 text-nominal' : 'border-watch/50 bg-watch/10 text-watch'}`}>
          {ci.completed ? '✓ Today’s check-in complete' : 'Today’s check-in not done yet'}
        </p>
        {ci.missedYesterday && <p className="rounded-xl border border-line p-3 text-text-2">Yesterday was missed. The agent asked for yesterday’s data as well.</p>}
        <p className="rounded-xl border border-line p-3 text-text-3">About 3 minutes. Answers feed the sleep tracker, mental-health score and root-cause analysis.</p>
      </aside>
    </div>
  );
}

/** Feature 9 — manager agent, available any time; the astronaut's report outranks the watch. */
export function AgentChat({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const msgs = s.agentChats[a.id];
  const first = a.name.split(' ')[0];
  const quick = ['I feel ill', 'How did I sleep?', 'What medication am I on?', 'Radiation level?'];
  return (
    <div>
      <Thread messages={msgs} name={first} />
      <div className="mt-3 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button key={q} className="h-9 rounded-full border border-line-strong px-3 text-xs text-text-2 hover:bg-space-3 hover:text-white" onClick={() => dispatch({ type: 'agent', id: a.id, text: q })}>
            {q}
          </button>
        ))}
      </div>
      <Composer onSend={(text) => dispatch({ type: 'agent', id: a.id, text })} placeholder={`Message the manager agent as ${first}…`} />
    </div>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, Clock3, Send } from 'lucide-react';
import { useMission } from '@/lib/mission';
import { useAgent } from '@/lib/agent';
import { useReducedMotion } from '@/lib/hooks';
import type { Astronaut, CheckInMessage } from '@/lib/types';
import { Notice, SourceTag, firstName, fmtTime } from './ui';

function Thread({ messages, name, pending }: { messages: CheckInMessage[]; name: string; pending: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  }, [messages.length, pending, still]);
  return (
    <div ref={ref} className="well flex max-h-[380px] min-h-[220px] flex-col gap-3 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}>
      {messages.map((m, i) =>
        m.from === 'agent' ? (
          <div key={i} className="max-w-[85%] self-start">
            <p className="label mb-1 flex items-center gap-2">
              Agent <span className="num">{fmtTime(m.at)}</span> <SourceTag source={m.source} />
            </p>
            <p className="rounded-[6px] rounded-tl-none border border-line bg-space-2 px-3 py-2 text-[0.9375rem]">{m.text}</p>
          </div>
        ) : (
          <div key={i} className="max-w-[85%] self-end">
            <p className="label mb-1 text-right">
              {name} <span className="num">{fmtTime(m.at)}</span>
            </p>
            <p className="rounded-[6px] rounded-tr-none bg-nasa-blue px-3 py-2 text-[0.9375rem] text-white">{m.text}</p>
          </div>
        ),
      )}
      {pending && (
        <div className="self-start" role="status">
          <span className="sr-only">The agent is writing</span>
          <span className="typing inline-flex items-center gap-1 rounded-[6px] rounded-tl-none border border-line bg-space-2 px-3 py-3 text-text-2" aria-hidden><i /><i /><i /></span>
        </div>
      )}
    </div>
  );
}

function Composer({ onSend, label, disabled }: { onSend: (t: string) => void; label: string; disabled?: boolean }) {
  const [t, setT] = useState('');
  const id = useId();
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!t.trim() || disabled) return;
        onSend(t.trim());
        setT('');
      }}
    >
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} value={t} onChange={(e) => setT(e.target.value)} placeholder={label} autoComplete="off" maxLength={600} className="field flex-1" />
      <button className="btn btn-primary" disabled={disabled || !t.trim()}>
        <Send className="size-4" aria-hidden /> Send
      </button>
    </form>
  );
}

/** Feature 5: the daily check-in, about three minutes. Feeds sleep, mental health and root cause. */
export function CheckInChat({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const { sendCheckin } = useAgent();
  const ci = s.checkins[a.id];
  const pending = !!s.pending[`checkin:${a.id}`];
  const first = firstName(a.name);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div>
        <Thread messages={ci.messages} name={first} pending={pending} />
        <Composer onSend={(text) => void sendCheckin(a.id, text)} label={`Answer as ${first}`} disabled={pending} />
      </div>
      <aside className="flex flex-col gap-2">
        <Notice tone={ci.completed ? 'nominal' : 'watch'} icon={ci.completed ? <CircleCheck className="size-4" aria-hidden /> : <Clock3 className="size-4" aria-hidden />} role="status">
          {ci.completed ? 'Today’s check-in is complete.' : 'Today’s check-in is not done yet.'}
        </Notice>
        {ci.missedYesterday && <p className="text-sm text-text-2">Yesterday was missed, so the agent asks for yesterday’s answers as well.</p>}
        <p className="text-sm text-text-3">Takes about 3 minutes. Answers feed the sleep tracker, the mental-health score and the root-cause analysis.</p>
      </aside>
    </div>
  );
}

/** Feature 9: the manager agent, any time. What the astronaut reports outranks the watch. */
export function AgentChat({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const { sendChat } = useAgent();
  const msgs = s.agentChats[a.id] ?? [];
  const pending = !!s.pending[`chat:${a.id}`];
  const first = firstName(a.name);
  const quick = ['I feel ill', 'How did I sleep?', 'What medication am I on?', 'What is the radiation level?'];
  return (
    <div>
      <Thread messages={msgs} name={first} pending={pending} />
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
        {quick.map((q) => (
          <button key={q} type="button" className="btn btn-sm btn-ghost font-medium" disabled={pending} onClick={() => void sendChat(a.id, q)}>
            {q}
          </button>
        ))}
      </div>
      <Composer onSend={(text) => void sendChat(a.id, text)} label={`Message the agent as ${first}`} disabled={pending} />
    </div>
  );
}

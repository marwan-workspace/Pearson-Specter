'use client';

import { useCallback, useRef, useState } from 'react';
import { backendRequest } from './session';
import { usePoll } from './hooks';
import type { ChainMember, ChatMessage, CheckIn, CrewAlert, Decision, RecordStreams, StockItem } from './types';

type StreamName = keyof RecordStreams;
type Row = { id: string } & Record<string, unknown>;
const STREAMS: StreamName[] = ['vitals', 'sleep', 'mental', 'checkins', 'assessment', 'plan', 'medications', 'labs', 'events', 'decisions'];
/** The column each stream is paged by with ?since=. */
const TIME_KEY: Record<StreamName, string> = { vitals: 'observed_at', sleep: 'started_at', mental: 'completed_at', checkins: 'started_at', assessment: 'assessed_at', plan: 'created_at', medications: 'proposed_at', labs: 'collected_at', events: 'started_at', decisions: 'decided_at' };
export const VITALS_WINDOW_MS = 3 * 3600_000;
const EMPTY: RecordStreams = { vitals: [], sleep: [], mental: [], checkins: [], assessment: [], plan: [], medications: [], labs: [], events: [], decisions: [] };

export interface Related {
  alerts: CrewAlert[];
  stock: StockItem[];
  pending: Decision[];
  chain: ChainMember[];
  /** Today's saved check-in conversation and the latest private chat, as the server has them. */
  checkin: ChatMessage[];
  chat: { id: string; messages: ChatMessage[] } | null;
}

/**
 * One astronaut's record. The ten streams load in full once, then every 2 s only rows newer than the last one
 * (?since=). Alerts, stock, pending decisions and the saved conversations reload every 10 s and after each action.
 */
export function useRecord(astronautKey: string, isSelf: boolean) {
  const [records, setRecords] = useState<RecordStreams | null>(null);
  const [related, setRelated] = useState<Related | null>(null);
  const [error, setError] = useState('');
  const cursor = useRef<Partial<Record<StreamName, string>>>({});
  const polling = useRef(false);
  const wantFull = useRef(false);
  const ticks = useRef(0);
  const key = encodeURIComponent(astronautKey);

  const loadStreams = useCallback(async (initial = false) => {
    if (polling.current) { if (initial) wantFull.current = true; return; } // a full reload asked mid-poll runs right after it
    polling.current = true;
    try {
      const fresh: Partial<Record<StreamName, Row[]>> = {};
      const next = initial ? {} : { ...cursor.current };
      // all ten at once: each request costs several round trips to the database, so one after another is slow
      await Promise.all(STREAMS.map(async (name) => {
        // a full load of vitals is the last 3 hours (about 180 rows), which is all the page charts
        const since = next[name] ?? (name === 'vitals' ? new Date(Date.now() - VITALS_WINDOW_MS).toISOString() : undefined);
        const result = await backendRequest<{ items: Row[] }>(`/astronauts/${key}/${name}${since ? `?since=${encodeURIComponent(since)}` : ''}`);
        const items = (fresh[name] = result.items || []);
        const latest = items.map((x) => x[TIME_KEY[name]] as string | null).filter(Boolean).sort((a, b) => Date.parse(b!) - Date.parse(a!))[0];
        if (latest && (!next[name] || Date.parse(latest) > Date.parse(next[name]!))) next[name] = latest;
      }));
      cursor.current = next;
      setRecords((prev) => {
        if (initial || !prev) return { ...EMPTY, ...fresh } as RecordStreams;
        const merged = { ...prev } as unknown as Record<StreamName, Row[]>;
        for (const name of STREAMS) {
          const rows = fresh[name] || [];
          if (!rows.length) continue;
          const have = new Set((prev[name] as unknown as Row[]).map((x) => x.id));
          merged[name] = [...rows.filter((x) => !have.has(x.id)), ...(prev[name] as unknown as Row[])];
        }
        return merged as unknown as RecordStreams;
      });
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the astronaut record.'); }
    finally {
      polling.current = false;
      if (wantFull.current) { wantFull.current = false; void loadStreams(true); }
    }
  }, [key]);

  const loadRelated = useCallback(async () => {
    try {
      const [a, s, d, ch, ci, cmd] = await Promise.all([
        backendRequest<{ items: CrewAlert[] }>('/alerts'),
        backendRequest<{ items: StockItem[] }>('/medications'),
        backendRequest<{ items: Decision[] }>('/decisions/pending'),
        isSelf ? backendRequest<{ items: { id: string; messages: { speaker: string; text: string; sentAt: string }[] }[] }>(`/astronauts/${key}/chat`) : Promise.resolve({ items: [] }),
        backendRequest<{ items: CheckIn[] }>(`/astronauts/${key}/checkins`),
        backendRequest<{ crew: ChainMember[] }>('/command'),
      ]);
      const latestCheckin = ci.items.find((x) => Array.isArray(x.transcript) && x.transcript.length);
      const chat = ch.items[0];
      setRelated({
        alerts: a.items, stock: s.items, pending: d.items, chain: cmd.crew,
        checkin: (latestCheckin?.transcript || []).map((m) => ({ from: m.from === 'agent' ? 'agent' : 'astronaut', text: String(m.text || ''), at: Number(m.at) || Date.now() })),
        chat: chat ? { id: String(chat.id), messages: (chat.messages || []).map((m) => ({ from: m.speaker === 'astronaut' ? 'astronaut' : 'agent', text: String(m.text || ''), at: Date.parse(m.sentAt) || Date.now() })) } : null,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load alerts and decisions.'); }
  }, [key, isSelf]);

  // The page mounts this hook with key={astronaut}, so each astronaut starts from an empty record and cursor.
  // The first poll has no cursor yet, which makes it the full load. ?since= only brings new rows, so every
  // 30 s one poll is a full load: that is how a status the server changed (event resolved, dose given) shows up.
  usePoll(() => loadStreams(ticks.current++ % 15 === 14), 2000);
  usePoll(loadRelated, 10_000, isSelf);

  const reload = useCallback(() => Promise.all([loadStreams(true), loadRelated()]).then(() => undefined), [loadStreams, loadRelated]);
  return { records, related, error, reload };
}

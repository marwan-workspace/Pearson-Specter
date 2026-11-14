'use client';

import { useEffect, useRef, useState } from 'react';

/** Calls `fn` now and then every `ms`, skipping ticks while the tab is hidden. `fn` may change between renders. */
export function usePoll(fn: () => void | Promise<void>, ms: number, key: unknown = null) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    let running = false; // a slow backend must not stack polls: skip a tick while the last one is still out
    const tick = async () => { if (running) return; running = true; try { await latest.current(); } finally { running = false; } };
    void tick();
    const t = setInterval(() => { if (!document.hidden) void tick(); }, ms);
    return () => clearInterval(t);
  }, [ms, key]);
}

/** A clock that re-renders the caller every `ms`, so "40 s ago" labels stay true. */
export function useNow(ms = 10_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

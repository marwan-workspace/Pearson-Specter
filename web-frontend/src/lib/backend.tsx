'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { agentApi, type BackendHealth } from './api';

/**
 * Connection state for the Gemini-backed agent.
 *
 *  live       the backend is ready and replies come from Gemini
 *  simulated  the backend is not ready (or the user chose the simulation), replies come from local rules
 *  checking   the first health check has not returned yet
 *
 * Nothing on the dashboard depends on the backend: every agent feature falls back to the local
 * simulation, the same way the ship keeps working without Earth contact.
 */
export type AgentStatus = 'checking' | 'live' | 'simulated';
export type AgentPreference = 'auto' | 'simulated';

interface BackendCtx {
  status: AgentStatus;
  health: BackendHealth | null;
  /** Last failure from a real call or the health check, in plain words. */
  lastError: string | null;
  preference: AgentPreference;
  setPreference: (p: AgentPreference) => void;
  /** Re-runs the health check. Resolves with the fresh result. */
  refresh: () => Promise<BackendHealth | null>;
  checking: boolean;
  /** Called by agent features when a live call fails, so the header can show it. */
  reportError: (message: string) => void;
}

const Ctx = createContext<BackendCtx | null>(null);
const PREF_KEY = 'crew-health-agent-pref';

export function BackendProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [preference, setPref] = useState<AgentPreference>('auto');
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    setChecking(true);
    try {
      const h = await agentApi.health(ac.signal);
      if (ac.signal.aborted) return null;
      setHealth(h);
      if (h.ready) setLastError(null);
      return h;
    } catch (e) {
      if (ac.signal.aborted) return null;
      setHealth(null);
      setLastError(e instanceof Error ? e.message : 'The health check failed.');
      return null;
    } finally {
      if (!ac.signal.aborted) setChecking(false);
    }
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(PREF_KEY) === 'simulated') setPref('simulated');
    } catch {
      /* storage unavailable */
    }
    void refresh();
    return () => inflight.current?.abort();
  }, [refresh]);

  const setPreference = useCallback((p: AgentPreference) => {
    setPref(p);
    try {
      localStorage.setItem(PREF_KEY, p);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<BackendCtx>(() => {
    const status: AgentStatus = health === null && checking ? 'checking' : preference === 'auto' && health?.ready ? 'live' : 'simulated';
    return { status, health, lastError, preference, setPreference, refresh, checking, reportError: setLastError };
  }, [health, checking, lastError, preference, setPreference, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBackend() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBackend outside BackendProvider');
  return c;
}

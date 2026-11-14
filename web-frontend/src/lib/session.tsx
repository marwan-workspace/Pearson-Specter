'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface SessionMe {
  astronaut: { id: string; name: string; callsign: string; role: string; rank: number; fitForCommand: boolean };
  actingLeaderId: string;
  isActingLeader: boolean;
  deciderId: string | null;
  mission: { id: string; name: string; destination: string; earthLinkAvailable?: boolean; earthRoundTripSeconds?: number; earthReviewSeconds?: number };
}


async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !['/me','/auth/login'].includes(path)) window.dispatchEvent(new Event('crew-session-expired'));
    const error = new Error(typeof data?.error === 'string' ? data.error : `Backend request failed (${response.status}).`) as Error & {status:number};
    error.status=response.status;throw error;
  }
  return data as T;
}

type AgentJob<T> = { id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; result?: T; error?: string };
export async function backendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (init.method === 'POST' && /^\/(assess|weekly|checkin|chat|emergency)$/.test(path)) {
    let job = await request<AgentJob<T>>('/jobs', { ...init, body: JSON.stringify({ command: path.slice(1), input: JSON.parse(String(init.body || '{}')), requestId: crypto.randomUUID() }) });
    const deadline = Date.now() + 10 * 60_000;
    while (job.status === 'queued' || job.status === 'running') {
      if (Date.now() > deadline) throw new Error('This request is still processing. Refresh the record before retrying.');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      job = await request<AgentJob<T>>(`/jobs/${job.id}`, { signal: init.signal });
    }
    if (job.status === 'failed') throw new Error(job.error || 'The request could not be completed.');
    return job.result as T;
  }
  return request<T>(path, init);
}

interface SessionContextValue { me: SessionMe | null; loading: boolean; error: string | null; login: (login: string, pin: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current=++generation.current;
    setLoading(true);
    try { const data=await backendRequest<SessionMe>('/me'); if(current===generation.current){setMe(data);setError(null);} }
    catch (e) { if(current===generation.current){setMe(null);if (e instanceof Error && !/sign in|session/i.test(e.message)) setError(e.message);} }
    finally { if(current===generation.current)setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {const expired=()=>{generation.current++;setMe(null);setLoading(false);};window.addEventListener('crew-session-expired',expired);return()=>window.removeEventListener('crew-session-expired',expired);},[]);

  const login = useCallback(async (loginName: string, pin: string) => {
    setError(null);
    await backendRequest('/auth/login', { method: 'POST', body: JSON.stringify({ login: loginName, pin }) });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    generation.current++;
    try { await backendRequest('/auth/logout', { method: 'POST', body: '{}' }); }
    finally { setMe(null); }
  }, []);

  const value = useMemo(() => ({ me, loading, error, login, logout, refresh }), [me, loading, error, login, logout, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider.');
  return value;
}

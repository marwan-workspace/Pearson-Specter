'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface SessionMe {
  astronaut: { id: string; name: string; callsign: string; role: string; rank: number; fitForCommand: boolean };
  actingLeaderId: string;
  isActingLeader: boolean;
  deciderId: string | null;
  mission: { id: string; name: string; destination: string; earthLinkAvailable?: boolean; earthRoundTripSeconds?: number; earthReviewSeconds?: number };
}

export async function backendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Backend request failed (${response.status}).`);
  return data as T;
}

interface SessionContextValue { me: SessionMe | null; loading: boolean; error: string | null; login: (login: string, pin: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setMe(await backendRequest<SessionMe>('/me')); setError(null); }
    catch (e) { setMe(null); if (e instanceof Error && !/sign in|session/i.test(e.message)) setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (loginName: string, pin: string) => {
    setError(null);
    await backendRequest('/auth/login', { method: 'POST', body: JSON.stringify({ login: loginName, pin }) });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
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

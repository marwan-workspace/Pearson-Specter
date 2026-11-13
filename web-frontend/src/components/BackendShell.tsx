'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { SessionProvider, useSession } from '@/lib/session';

function LoginScreen() {
  const { login, error } = useSession();
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { await login(name, pin); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto grid min-h-[78vh] max-w-lg place-items-center px-4">
    <section className="panel w-full p-7 md:p-9">
      <div className="mb-6 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-space-3 text-ink"><ShieldCheck aria-hidden /></span><div><p className="label">Crew health system</p><h1 className="title text-2xl">Sign in</h1></div></div>
      <p className="mb-6 text-sm text-text-2">Use your crew login and PIN to open your private health record.</p>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold">Crew login<input autoComplete="username" className="input" value={name} onChange={e=>setName(e.target.value)} required /></label>
        <label className="grid gap-1.5 text-sm font-semibold">PIN<input autoComplete="current-password" inputMode="numeric" type="password" pattern="[0-9]{4,12}" className="input" value={pin} onChange={e=>setPin(e.target.value)} required /></label>
        {(message||error)&&<p role="alert" className="rounded-lg border border-watch/40 bg-watch/10 p-3 text-sm text-watch">{message||error}</p>}
        <button className="btn btn-primary mt-1 justify-center" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
      </form>
    </section>
  </main>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const [loggingOut,setLoggingOut]=useState(false);
  if (loading) return <main className="mx-auto max-w-5xl px-4 py-16"><div className="skeleton h-48" /></main>;
  if (!me) return <LoginScreen />;
  return <>
    <header className="sticky top-0 z-30 border-b border-line bg-space/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between px-4 py-3 md:px-8">
        <a href="/" className="title text-lg">Crew Health <span className="ml-2 text-xs font-normal text-text-2">{me.mission.destination} mission</span></a>
        <div className="flex items-center gap-3"><div className="text-right"><p className="text-sm font-semibold">{me.astronaut.name}</p><p className="label">{me.isActingLeader?'Acting team leader':`Crew · rank ${me.astronaut.rank}`}</p></div><button onClick={async()=>{setLoggingOut(true);await logout();setLoggingOut(false);}} className="btn btn-quiet" disabled={loggingOut}><LogOut className="size-4" aria-hidden />{loggingOut?'Signing out':'Sign out'}</button></div>
      </div>
    </header>
    <main id="main" className="mx-auto max-w-[1680px] px-4 pb-20 pt-6 md:px-8">{children}</main>
  </>;
}

export function BackendShell({ children }: { children: ReactNode }) {
  return <SessionProvider><ShellContent>{children}</ShellContent></SessionProvider>;
}

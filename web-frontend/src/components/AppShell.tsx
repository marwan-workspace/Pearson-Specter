'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, HeartPulse, LayoutDashboard, Lock, LogOut, ShieldCheck, TriangleAlert, UserRound, Wifi, WifiOff } from 'lucide-react';
import { SessionProvider, useSession } from '@/lib/session';
import { Pill, Skeleton, Spinner, ThemeToggle } from './ui';

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-accent text-on-accent"><HeartPulse className="beat size-5" aria-hidden /></span>
      <span className="title whitespace-nowrap text-lg">Crew Health</span>
    </span>
  );
}

function SignIn() {
  const { login, error } = useSession();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const errorId = useId();
  const problem = message || error;
  const locked = !!problem && /locked/i.test(problem);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try { await login(name.trim(), pin); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-hairline p-12 lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div className="settle max-w-md">
          <p className="label mb-3">Onboard medical monitoring</p>
          <p className="display text-5xl">Every heartbeat, <span className="text-accent">accounted for.</span></p>
          <p className="mt-5 text-secondary">Live vitals from each crew member&rsquo;s watch, a daily check-in, and a medical agent that keeps working when Earth is out of reach.</p>
        </div>
        <ul className="grid gap-2 text-sm text-secondary">
          <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-nominal" aria-hidden />Your record is private to you and your decider.</li>
          <li className="flex items-center gap-2"><Lock className="size-4 text-nominal" aria-hidden />Five wrong PINs lock the account.</li>
        </ul>
      </aside>
      <main id="main" className="grid place-items-center px-4 py-10">
        <div className="settle glass w-full max-w-sm p-6 sm:p-8">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="title text-3xl">Sign in</h1>
          <p className="mb-6 mt-2 text-sm text-secondary">Use your crew login and PIN to open your health record.</p>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <label className="grid gap-1.5 text-sm font-semibold">
              Crew login
              <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} required aria-invalid={!!problem && !locked} aria-describedby={problem ? errorId : undefined} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              PIN
              <span className="relative">
                <input className="input num pr-12" autoComplete="current-password" inputMode="numeric" type={show ? 'text' : 'password'} pattern="[0-9]{4,12}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required aria-invalid={!!problem && !locked} aria-describedby={problem ? errorId : undefined} />
                <button type="button" className="btn btn-icon btn-quiet absolute right-0 top-0" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide PIN' : 'Show PIN'} aria-pressed={show}>
                  {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                </button>
              </span>
              <span className="label font-normal">4 to 12 digits</span>
            </label>
            {problem && (
              <p id={errorId} role="alert" className={`alert-in flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm ${locked ? 'border-fault bg-fault-glow' : 'border-critical bg-critical-glow'}`}>
                {locked ? <Lock className="mt-0.5 size-4 shrink-0 text-fault" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />}
                {problem}
              </p>
            )}
            <button className="btn btn-primary mt-1" disabled={busy || !name.trim() || pin.length < 4}>
              {busy && <Spinner />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="mt-8 flex items-center justify-between border-t border-hairline pt-4">
            <p className="label">Locked out? Ask the acting leader to unlock your account.</p>
            <ThemeToggle />
          </div>
        </div>
      </main>
    </div>
  );
}

function NavLink({ href, icon: Icon, children }: { href: string; icon: typeof UserRound; children: string }) {
  const active = usePathname() === href;
  return (
    <Link href={href} className="tab" aria-current={active ? 'page' : undefined} aria-label={children}>
      <Icon className="size-4" aria-hidden />
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const [leaving, setLeaving] = useState(false);

  if (loading && !me) {
    return (
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-16" role="status" aria-label="Loading your session">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }
  if (!me) return <SignIn />;

  const linkUp = me.mission.earthLinkAvailable !== false;
  return (
    <>
      <header className="hud-bar sticky top-0 z-30">
        <div className="mx-auto flex h-[var(--header-h)] max-w-[1440px] items-center gap-2 px-4 md:gap-4 md:px-8">
          <Link href="/" aria-label="Crew Health home"><Brand /></Link>
          <nav aria-label="Main" className="flex self-stretch">
            {me.isActingLeader && <NavLink href="/" icon={LayoutDashboard}>Crew overview</NavLink>}
            <NavLink href={`/astronaut/${me.astronaut.callsign.toLowerCase()}`} icon={UserRound}>My record</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:gap-3">
            <span className="hidden xl:inline-flex"><Pill tone={linkUp ? 'nominal' : 'warning'} icon={linkUp ? Wifi : WifiOff}>{me.mission.destination} · Earth link {linkUp ? 'up' : 'down'}</Pill></span>
            <div className="hidden whitespace-nowrap text-right lg:block">
              <p className="text-sm font-semibold leading-tight">{me.astronaut.name}</p>
              <p className="label">{me.isActingLeader ? 'Acting team leader' : `Crew · rank ${me.astronaut.rank}`}</p>
            </div>
            <ThemeToggle />
            <button className="btn btn-quiet px-3" disabled={leaving} aria-label="Sign out"
              onClick={async () => { setLeaving(true); try { await logout(); } finally { setLeaving(false); } }}>
              {leaving ? <Spinner /> : <LogOut className="size-4" aria-hidden />}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 md:px-8">{children}</main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <SessionProvider><Shell>{children}</Shell></SessionProvider>;
}

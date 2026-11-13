'use client';

import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Activity, ArrowRight, Brain, ClipboardList, HeartPulse, Moon, MousePointerClick, Pill } from 'lucide-react';
import { astronautStatus, useMission } from '@/lib/mission';
import { CREW, mentalChecks, sleepNights } from '@/lib/crew';
import { scoreSeries } from '@/lib/conditions';
import type { Astronaut } from '@/lib/types';
import { Astronaut3D } from '@/components/three/Astronaut3D';
import { STATUS_META, StatusPill, scoreTone } from '@/components/ui';

function FeatureTile({ n, title, icon, children, tone }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode; tone?: 'nominal' | 'watch' | 'critical' }) {
  return (
    <div className="rounded-xl border border-line bg-space-0/40 p-3" style={tone && tone !== 'nominal' ? { borderColor: `color-mix(in srgb, ${STATUS_META[tone].color} 45%, transparent)` } : undefined}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-3">
        {icon} <span className="num text-nasa-red">{n}</span> {title}
      </p>
      {children}
    </div>
  );
}

function CrewCard({ a }: { a: Astronaut }) {
  const { s } = useMission();
  const v = s.vitals[a.id] ?? [];
  const last = v[v.length - 1];
  const st = astronautStatus(s, a.id);
  const night = sleepNights(a.id).slice(-1)[0];
  const mh = mentalChecks(a.id);
  const mhNow = mh[mh.length - 1].score;
  const mhDelta = mhNow - mh[mh.length - 8].score;
  const plan = s.plans[a.id] ?? [];
  const meds = s.meds[a.id] ?? [];
  const vScore = Math.round(
    (scoreSeries(v.map((x) => x.heartRate - x.activity * 78), a.baseline.heartRate, 15) +
      scoreSeries(v.map((x) => x.systolic - x.activity * 18), a.baseline.systolic, 12) +
      scoreSeries(v.map((x) => x.spo2), a.baseline.spo2, 3)) / 3,
  );
  const href = `/astronaut/${a.id}`;
  const fault = s.sensorFault[a.id];

  return (
    <article className={`panel flex flex-col overflow-hidden ${st.status === 'critical' ? 'border-critical/70' : ''}`} aria-labelledby={`n-${a.id}`}>
      <div aria-hidden className="h-1" style={{ background: `linear-gradient(90deg, ${STATUS_META[st.status].color}, transparent)` }} />
      {/* 3D model — click to open the full record */}
      <Link href={href} className="group relative block h-[300px] bg-[radial-gradient(circle_at_50%_35%,rgba(11,61,145,0.45),transparent_70%)]" aria-label={`Open ${a.name}'s full health record`}>
        <Astronaut3D label={`3D model of ${a.name}`} suitColor={a.suitColor} visorTint={a.visorTint} status={st.status} heartRate={last?.heartRate ?? 60} />
        <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-space-0/70 px-3 py-1 text-xs text-text-2 opacity-80 transition group-hover:border-nasa-bright group-hover:text-white group-hover:opacity-100">
          <MousePointerClick className="size-3.5" aria-hidden /> Open full record
        </span>
        <span className="absolute left-3 top-3"><StatusPill status={st.status} /></span>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <Link href={href} className="hover:underline">
            <h2 id={`n-${a.id}`} className="text-xl font-semibold">{a.name}</h2>
          </Link>
          <p className="text-sm text-text-3">{a.role} · age {a.age}</p>
          <p className="mt-1 text-sm" style={{ color: STATUS_META[st.status].color }}>{st.reason}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Feature 3 — short-term vitals (last 24 h, scored) */}
          <FeatureTile n={3} title="Vitals 24 h" icon={<HeartPulse className="size-3.5" aria-hidden />} tone={fault ? 'watch' : scoreTone(vScore)}>
            <p className="num text-2xl font-semibold">{fault ? '—' : vScore}<span className="text-xs text-text-3">/100</span></p>
            <p className="num text-xs text-text-2">
              {fault ? 'Sensor fault' : last ? `${Math.round(last.heartRate)} bpm · ${Math.round(last.spo2)}% · ${Math.round(last.systolic)}/${Math.round(last.diastolic)}` : '…'}
            </p>
            <div className="mt-1 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={v.slice(-60)}>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area type="monotone" dataKey="heartRate" stroke={STATUS_META[st.status].color} fill={STATUS_META[st.status].color} fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </FeatureTile>

          {/* Feature 1 — sleep tracker */}
          <FeatureTile n={1} title="Sleep" icon={<Moon className="size-3.5" aria-hidden />} tone={night.hours < 6 ? 'watch' : 'nominal'}>
            <p className="num text-2xl font-semibold">{night.hours}<span className="text-xs text-text-3"> h</span></p>
            <p className="text-xs text-text-2"><span className="num">{night.cycles}</span> cycles · <span className="num">{night.efficiency}%</span> efficiency</p>
            <p className="text-xs text-text-3">Self-rated {night.selfRated}/5</p>
          </FeatureTile>

          {/* Feature 2 — mental health */}
          <FeatureTile n={2} title="Mental health" icon={<Brain className="size-3.5" aria-hidden />} tone={scoreTone(mhNow)}>
            <p className="num text-2xl font-semibold">{mhNow}<span className="text-xs text-text-3">/100</span></p>
            <p className="text-xs text-text-2">
              <span className="num">{mhDelta >= 0 ? '+' : ''}{mhDelta}</span> vs last week
            </p>
            <p className="text-xs text-text-3">Sent to mission command</p>
          </FeatureTile>

          {/* Feature 4 — treatment plan */}
          <FeatureTile n={4} title="Treatment plan" icon={<ClipboardList className="size-3.5" aria-hidden />} tone={plan.some((p) => p.urgent) ? 'watch' : 'nominal'}>
            <p className="num text-2xl font-semibold">{plan.length}<span className="text-xs text-text-3"> items</span></p>
            <p className="text-xs text-text-2">{plan.filter((p) => p.urgent).length} urgent · {plan.filter((p) => p.approval === 'pending-mission-command').length} awaiting mission command</p>
          </FeatureTile>
        </div>

        <div className="rounded-xl border border-line bg-space-0/40 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-3"><Pill className="size-3.5" aria-hidden /> Medication</p>
          <ul className="flex flex-wrap gap-1.5">
            {meds.map((m) => (
              <li key={m.name} className="rounded-md border border-line-strong px-2 py-1 text-xs">
                <b>{m.name}</b> <span className="text-text-3">{m.dose}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link href={href} className="btn btn-primary mt-auto w-full">
          Full health record <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export default function CrewOverview() {
  const { s } = useMission();
  if (!s.ready) {
    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {CREW.map((c) => <div key={c.id} className="panel h-[720px] animate-pulse" />)}
      </div>
    );
  }
  const statuses = CREW.map((c) => astronautStatus(s, c.id).status);
  return (
    <div className="flex flex-col gap-5">
      {/* Feature 16 — crew overview at a glance */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Feature 16 · Crew overview</p>
          <h1 className="text-3xl font-semibold tracking-tight">Crew health</h1>
          <p className="mt-1 text-text-2">Select an astronaut to open charts, medication and every other feature.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Crew status summary">
          {(['nominal', 'watch', 'critical'] as const).map((k) => {
            const m = STATUS_META[k];
            const I = m.icon;
            return (
              <span key={k} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm ${m.cls}`}>
                <I className="size-4" aria-hidden /> <b className="num text-base">{statuses.filter((x) => x === k).length}</b> {m.label}
              </span>
            );
          })}
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm text-text-2">
            <Activity className="size-4 text-nasa-bright" aria-hidden /> Live watch stream
            <span className="blink size-2 rounded-full bg-nominal" aria-hidden />
          </span>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {CREW.map((a) => <CrewCard key={a.id} a={a} />)}
      </div>
    </div>
  );
}

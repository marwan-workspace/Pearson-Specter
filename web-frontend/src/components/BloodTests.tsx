'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Droplet, Plus, X } from 'lucide-react';
import { useMission } from '@/lib/mission';
import { BLOOD_MARKERS } from '@/lib/crew';
import type { Astronaut } from '@/lib/types';
import { Panel } from './ui';

/** Feature 15: periodic lab results entered on the dashboard. */
export function BloodTests({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const tests = s.blood[a.id];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const bad = (key: string) => form[key] === undefined || form[key].trim() === '' || Number.isNaN(Number(form[key]));
  const valid = BLOOD_MARKERS.every((m) => !bad(m.key));
  return (
    <Panel
      id="blood"
      feature="Feature 15"
      title="Blood tests"
      icon={<Droplet className="size-5 text-nasa-bright" aria-hidden />}
      right={
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="blood-form">
          {open ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {open ? 'Close' : 'Enter results'}
        </button>
      }
    >
      {open && (
        <form
          id="blood-form"
          noValidate
          className="fade-in well mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (!valid) return;
            dispatch({ type: 'blood', id: a.id, values: Object.fromEntries(BLOOD_MARKERS.map((m) => [m.key, Number(form[m.key])])) });
            setForm({});
            setTried(false);
            setOpen(false);
          }}
        >
          {BLOOD_MARKERS.map((m) => {
            const err = tried && bad(m.key);
            return (
              <label key={m.key} className="label grid gap-1">
                <span>{m.label}, {m.unit}</span>
                <input
                  inputMode="decimal"
                  value={form[m.key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [m.key]: e.target.value }))}
                  className={`field num ${err ? 'border-critical' : ''}`}
                  aria-invalid={err || undefined}
                  aria-describedby={`${m.key}-hint`}
                />
                <span id={`${m.key}-hint`} className={err ? 'text-critical' : undefined}>{err ? 'Enter a number.' : `Normal range ${m.range[0]} to ${m.range[1]}`}</span>
              </label>
            );
          })}
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button className="btn btn-primary">Save lab results</button>
            {tried && !valid && <p className="text-sm text-critical" role="alert">Fill in every marker with a number to save.</p>}
          </div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th>Marker</th>
              <th>Normal range</th>
              {tests.map((t) => <th key={t.id} className="num">{t.date}</th>)}
            </tr>
          </thead>
          <tbody>
            {BLOOD_MARKERS.map((m) => (
              <tr key={m.key}>
                <td className="font-medium">{m.label} <span className="label">{m.unit}</span></td>
                <td className="num text-text-3">{m.range[0]} to {m.range[1]}</td>
                {tests.map((t) => {
                  const v = t.values[m.key];
                  const low = v < m.range[0];
                  const high = v > m.range[1];
                  return (
                    <td key={t.id} className={`num ${low || high ? 'font-bold text-watch' : ''}`}>
                      {v}
                      {low && <ArrowDown className="ml-1 inline size-3.5" aria-label="below range" />}
                      {high && <ArrowUp className="ml-1 inline size-3.5" aria-label="above range" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

'use client';

import { useState } from 'react';
import { Droplet, Plus } from 'lucide-react';
import { useMission } from '@/lib/mission';
import { BLOOD_MARKERS } from '@/lib/crew';
import type { Astronaut } from '@/lib/types';
import { Panel } from './ui';

/** Feature 15 — periodic lab results entered on the dashboard. */
export function BloodTests({ a }: { a: Astronaut }) {
  const { s, dispatch } = useMission();
  const tests = s.blood[a.id];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const valid = BLOOD_MARKERS.every((m) => form[m.key] !== undefined && form[m.key] !== '' && !Number.isNaN(Number(form[m.key])));
  return (
    <Panel id="blood" feature="Feature 15 · Blood test entry (lab draws)" title="Blood tests" icon={<Droplet className="size-5 text-nasa-red" aria-hidden />}
      right={<button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Plus className="size-4" aria-hidden /> Enter results</button>}>
      {open && (
        <form
          className="mb-4 grid gap-2 rounded-xl border border-line bg-space-0/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            dispatch({ type: 'blood', id: a.id, values: Object.fromEntries(BLOOD_MARKERS.map((m) => [m.key, Number(form[m.key])])) });
            setForm({});
            setOpen(false);
          }}
        >
          {BLOOD_MARKERS.map((m) => (
            <label key={m.key} className="text-xs text-text-2">
              {m.label} <span className="text-text-3">({m.unit})</span>
              <input inputMode="decimal" value={form[m.key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [m.key]: e.target.value }))} className="num mt-1 h-11 w-full rounded-lg border border-line-strong bg-space-2 px-3 text-sm" placeholder={`${m.range[0]}–${m.range[1]}`} />
            </label>
          ))}
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button className="btn btn-primary" disabled={!valid}>Save lab results</button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-space-2 text-left text-[11px] uppercase tracking-wider text-text-3">
            <tr>
              <th className="px-3 py-2">Marker</th>
              <th className="px-3 py-2">Range</th>
              {tests.map((t) => <th key={t.id} className="num px-3 py-2">{t.date}</th>)}
            </tr>
          </thead>
          <tbody>
            {BLOOD_MARKERS.map((m) => (
              <tr key={m.key} className="border-t border-line">
                <td className="px-3 py-1.5 font-medium">{m.label} <span className="text-xs text-text-3">{m.unit}</span></td>
                <td className="num px-3 py-1.5 text-text-3">{m.range[0]}–{m.range[1]}</td>
                {tests.map((t) => {
                  const v = t.values[m.key];
                  const out = v < m.range[0] || v > m.range[1];
                  return (
                    <td key={t.id} className={`num px-3 py-1.5 ${out ? 'font-bold text-watch' : ''}`}>
                      {v}{out ? (v < m.range[0] ? ' ▼' : ' ▲') : ''}
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

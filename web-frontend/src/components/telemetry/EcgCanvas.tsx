'use client';

import { useEffect, useRef } from 'react';
import type { TelemetryEngine } from '@/lib/telemetry';

/**
 * One cardiac cycle as a sum of Gaussian bumps, one per wave of the P-Q-R-S-T complex, placed in SECONDS
 * relative to the R peak. QRS keeps its real width at any heart rate; only the P and T timing stretch with the
 * R-R interval (T by its square root, as the QT interval does). `t` is seconds since the last R peak.
 */
function pqrst(t: number, rr: number, m: { st: number; tAmp: number }) {
  const root = Math.sqrt(rr);
  const wave = (at: number, amp: number, width: number) => {
    // the same wave belongs to this beat and to the next one (the P wave arrives before its own R peak)
    const a = t - at, b = t - rr - at;
    return amp * (Math.exp(-(a * a) / (2 * width * width)) + Math.exp(-(b * b) / (2 * width * width)));
  };
  const pr = 0.16 * Math.min(1, Math.max(0.72, root));
  return (
    wave(-pr, 0.13, 0.024) + // P: atrial contraction
    wave(-0.028, -0.13, 0.008) + // Q
    wave(0, 1, 0.0105) + // R
    wave(0.03, -0.24, 0.0105) + // S
    wave(0.13 * root, m.st, 0.05) + // ST segment: 0 normally, depressed under strain
    wave(0.27 * root, m.tAmp, 0.048 * root) // T: repolarisation
  );
}

/** Finger pulse: a systolic upstroke and a dicrotic notch, arriving a fifth of a second after the R peak. */
function pleth(t: number, rr: number) {
  const phase = (((t - 0.2) / rr) % 1 + 1) % 1;
  const g = (c: number, w: number) => Math.exp(-((phase - c) ** 2) / (2 * w * w));
  return g(0.16, 0.075) + 0.42 * g(0.44, 0.1);
}

const SWEEP_PX_PER_S = 140; // about 25 mm/s on a typical display
const GAP = 26; // the dark bar the trace is rewritten behind

/**
 * A sweep oscilloscope at display refresh rate: ECG above, SpO2 plethysmograph below. The trace is written
 * left to right behind a glowing bar and old phosphor fades. Heart rate, strain morphology and sensor noise
 * come from the telemetry engine every frame.
 */
export function EcgCanvas({ engine }: { engine: TelemetryEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const beam = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0, last = performance.now();
    let x = 0, sinceR = 0, rr = 1, wander = 0, sinceFade = 0;
    let prevEcgY: number | null = null, prevPlethY: number | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = engine.sample(now);
      const dt = Math.min(0.05, (now - last) / 1000) * (s.paused ? 0 : s.speed);
      last = now;
      if (dt === 0 || document.hidden) return;

      const fault = s.sensorFault;
      const bpm = fault ? 72 : Math.max(25, s.values.hr);
      const hypoxic = s.values.spo2 < 90;
      const strained = hypoxic || s.activity === 'stress';
      // strain flattens then inverts the T wave and pulls the ST segment down
      const morph = hypoxic ? { st: -0.12, tAmp: -0.14 } : strained ? { st: -0.06, tAmp: 0.14 } : { st: 0, tAmp: 0.3 };

      // Old phosphor decays: ten small steps a second leave about half the brightness after one full sweep.
      // (A per-frame fade would need an alpha too small for an 8-bit canvas to apply.)
      sinceFade += dt;
      if (sinceFade > 0.1) {
        sinceFade = 0;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${reduced ? 0.008 : 0.016})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      // advance in small steps so the R spike is never skipped at high speed
      const steps = Math.max(1, Math.ceil((dt * SWEEP_PX_PER_S) / 1.5));
      const ecgMid = h * 0.36, ecgGain = h * 0.26, plethBase = h * 0.93, plethGain = h * 0.2;
      const ecgColor = fault ? color('--status-fault') : hypoxic ? color('--status-critical') : color('--accent-primary');
      for (let i = 0; i < steps; i++) {
        const step = dt / steps;
        sinceR += step;
        if (sinceR >= rr) { sinceR -= rr; rr = 60 / bpm; }
        wander += step;
        const noise = fault ? (Math.random() - 0.5) * 0.5 + 0.12 * Math.sin(wander * 2 * Math.PI * 50) + 0.25 * Math.sin(wander * 1.7) : (Math.random() - 0.5) * 0.012;
        const ecgY = ecgMid - (pqrst(sinceR, rr, morph) + noise) * ecgGain;
        const amplitude = fault ? 0.25 + Math.random() * 0.5 : hypoxic ? 0.55 : 1;
        const plethY = plethBase - pleth(sinceR, rr) * plethGain * amplitude;

        const nx = x + step * SWEEP_PX_PER_S;
        ctx.clearRect(nx, 0, GAP, h);
        if (prevEcgY !== null && prevPlethY !== null) {
          ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.shadowBlur = 10; ctx.shadowColor = ecgColor; ctx.strokeStyle = ecgColor;
          ctx.beginPath(); ctx.moveTo(x, prevEcgY); ctx.lineTo(nx, ecgY); ctx.stroke();
          const plethColor = color('--accent-secondary');
          ctx.shadowColor = plethColor; ctx.strokeStyle = plethColor;
          ctx.beginPath(); ctx.moveTo(x, prevPlethY); ctx.lineTo(nx, plethY); ctx.stroke();
          ctx.shadowBlur = 0;
        }
        prevEcgY = ecgY; prevPlethY = plethY; x = nx;
        if (x >= w) { x = 0; prevEcgY = null; prevPlethY = null; ctx.clearRect(0, 0, GAP, h); }
      }
      // the beam head is a separate element, so it glows without being burnt into the trace
      if (beam.current) beam.current.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [engine]);

  return (
    <div className="scope relative h-56 overflow-hidden rounded-[var(--radius-control)]">
      <canvas ref={ref} className="absolute inset-0 size-full" role="img" aria-label="Live ECG trace with the SpO2 pulse waveform below it" />
      <span ref={beam} className="beam" aria-hidden />
      <span className="label absolute left-3 top-2">ECG lead II</span>
      <span className="label absolute bottom-2 left-3">SpO₂ pleth</span>
    </div>
  );
}

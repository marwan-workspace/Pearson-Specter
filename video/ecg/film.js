// Hook overlay: a minimal ECG sweep on the black screen once the title has gone. Each R spike sits exactly on a
// heartbeat "lub" from clip_hook.py (work/hook_beats.json); after the last beat the trace goes flat.
// Black background, so it is laid over 00-hook.mp4 with a lighten blend.
import * as M from './lib/motion.js';

const { W, H, clamp } = M;
const HB = await fetch('../work/hook_beats.json').then((r) => r.json());
const SWEEP = 3.2;          // seconds across the screen
const Y = H / 2, AMP = 120;
const T_IN = HB.fade_at + 0.35;

// one beat, R peak at 0 (seconds); small P and T waves, sharp QRS
const g = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const beat = (d) => 0.10 * g(d, -0.16, 0.035) - 0.12 * g(d, -0.025, 0.010) + 1.0 * g(d, 0, 0.011) - 0.28 * g(d, 0.028, 0.012) + 0.22 * g(d, 0.24, 0.06);
function ecg(tau) {
  let v = 0;
  for (const b of HB.beats) { const d = tau - b; if (d > -0.3 && d < 0.5) v += beat(d); }
  return v;
}
const xOf = (tau) => (((tau - T_IN) / SWEEP) % 1) * W;

function draw(ctx, u, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (t < T_IN) return;
  const vis = clamp((t - T_IN) / 0.6) * (1 - clamp((t - (HB.dur - 0.9)) / 0.8));
  const head = xOf(t), written = Math.min(t - T_IN, SWEEP * 0.92);  // a gap ahead of the write head, like a monitor
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  const STEP = 3;
  for (let a = 0; a < written; a += (STEP / W) * SWEEP) {
    const tau0 = t - a, tau1 = t - a - (STEP / W) * SWEEP;
    const x0 = xOf(tau0), x1 = xOf(tau1);
    if (x1 > x0) continue;  // wrap: don't join the right edge to the left
    const fade = (1 - a / (SWEEP * 0.92)) ** 1.4;
    ctx.strokeStyle = `rgba(235,240,245,${0.55 * fade * vis})`;
    ctx.beginPath(); ctx.moveTo(x0, Y - AMP * ecg(tau0)); ctx.lineTo(x1, Y - AMP * ecg(tau1)); ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,255,255,${0.85 * vis})`;  // the write head
  ctx.beginPath(); ctx.arc(head, Y - AMP * ecg(t), 3, 0, Math.PI * 2); ctx.fill();
}

await M.film({ draw, samples: 1 });

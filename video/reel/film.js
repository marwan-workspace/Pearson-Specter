// Pearson-Specter hook, scenes 02-05 (reel time 0 = 0:37.08 of the final cut). A pure function of time.
// Picture = real footage only: VitaCuff frames (build/vc_capture2.py) and the dashboard screencast + screenshots
// (build/dash_capture.py), framed with hard cuts and log-space punch-ins. Typed HUD text comes from plan.json,
// written by build/reel_audio.py together with the real keystrokes, so every letter lands on its strike.
import * as M from './lib/motion.js';

const { W, H, clamp, E } = M;
const UI = 'UI', DISPLAY = 'Display';
const RED = '#FF4D4D';
const plan = await fetch('plan.json').then((r) => r.json());
const cast = await fetch('../work/dash/frames.json').then((r) => r.json());   // [[file, t], ...]

// [seconds, label, sfx, opts] -> HITS in beats (grid: 120 bpm from 0, so beat = 2 x seconds)
const S = [
  [1.26, 'VitaCuff emerges', 'impact', { gain: 0.28 }],
  [4.40, 'cut: live screen', 'whoosh', { len: 0.35, gain: 0.22 }],
  [6.93, 'cut: syringe bay', 'whoosh', { len: 0.35, gain: 0.22 }],
  [8.67, '3/3 loaded', 'thud', { gain: 0.4 }],
  [10.0, 'into the emergency', 'sub', { len: 1.2, gain: 0.5 }],
  [11.40, 'simulate menu', 'click', { gain: 0.2 }],
  [11.95, 'bradycardia', 'click', { gain: 0.2 }],
  [12.55, 'confirm', 'click', { gain: 0.25 }],
  [13.58, 'ALERT', 'impact', { gain: 0.45 }],
  [16.10, 'cut: pipeline', 'whoosh', { len: 0.4, gain: 0.25 }],
  [18.85, 'pan: rule book', 'whoosh', { len: 0.4, gain: 0.2 }],
  [23.30, 'cut: care', 'whoosh', { len: 0.4, gain: 0.25 }],
  [25.20, 'cut: events', 'whoosh', { len: 0.4, gain: 0.25 }],
  [28.00, 'Mars', 'sub', { len: 1.5, gain: 0.45 }],
  [30.60, 'link switch', 'click', { gain: 0.25 }],
  [31.40, 'Earth link down', 'thud', { gain: 0.45 }],
  [34.00, 'close', 'whoosh', { len: 0.6, gain: 0.18 }],
  [38.60, 'end card', 'impact', { gain: 0.6 }],
];
const HITS = S.map(([s, l, f, o]) => [s * 2, l, f, o]);
const KICKS = [1.26, 13.58, 31.40, 8.67];          // punch on these
const SHAKES = [[1.26, 6], [13.58, 14], [38.6, 5]];

// ------------------------------------------------------------ frame sources (loaded on demand per seek)
const CACHE = new Map();
function load(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const im = new Image(); im.src = url;
  const p = im.decode().then(() => im).catch(() => { console.error('missing ' + url); return null; });
  CACHE.set(url, p);
  if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value);
  return p;
}
const pad = (n) => String(n).padStart(4, '0');
const vcUrl = (t) => `../work/vc/f${pad(clamp(Math.floor(t * 30), 0, 299))}.jpg`;
const closeUrl = (t) => `../work/close/f${pad(clamp(Math.floor((t - 34) * 30), 0, 137))}.jpg`;
function castUrl(ts) {  // last screencast frame painted at or before capture time ts
  let lo = 0, hi = cast.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cast[m][1] <= ts) lo = m; else hi = m - 1; }
  return '../work/dash/' + cast[lo][0];
}

// dashboard shots: [a, b, source, view0, view1]; source = capture time at a (screencast, real time) or a still
// view = [cx, cy, zoom] normalised; zoom is interpolated in log space (constant-rate dolly)
const DASH = [
  [10.00, 11.40, 8.0, [0.50, 0.55, 1.0], [0.62, 0.78, 1.3]],         // Hiro, live telemetry
  [11.40, 11.95, 16.45, [0.86, 0.22, 2.0], [0.86, 0.24, 2.1]],       // Simulate
  [11.95, 12.55, 17.95, [0.84, 0.28, 2.0], [0.84, 0.29, 2.1]],       // Bradycardia (tier 1)
  [12.55, 13.58, 19.55, [0.84, 0.28, 2.1], [0.84, 0.30, 2.3]],       // Confirm
  [13.58, 16.10, 28.85, [0.36, 0.30, 1.75], [0.34, 0.30, 1.95]],     // the alert lands (9 s after confirm, real)
  [16.10, 18.85, 37.0, [0.30, 0.45, 1.6], [0.18, 0.44, 2.3]],      // pipeline -> activity classification
  [18.85, 23.30, 39.8, [0.30, 0.64, 2.2], [0.62, 0.64, 2.2]],      // guardrails: the rule book it can't overrule
  [23.30, 25.20, 'care', [0.74, 0.68, 1.75], [0.74, 0.70, 2.0]],      // medication log: dose held for review
  [25.20, 28.00, 'events', [0.40, 0.42, 1.35], [0.30, 0.45, 1.6]],   // the alert + condition event
  [28.00, 29.40, 70.0, [0.82, 0.27, 2.3], [0.82, 0.27, 2.5]],       // one-way delay to Earth
  [29.40, 30.60, 70.5, [0.82, 0.80, 1.9], [0.82, 0.82, 2.0]],        // mission controls: Mars
  [30.60, 31.40, 74.4, [0.84, 0.58, 2.0], [0.84, 0.58, 2.1]],        // Earth link switch
  [31.40, 34.00, 79.0, [0.62, 0.32, 1.45], [0.62, 0.30, 1.25]],      // link down: header + toast
];
const STILL = { care: '../work/dash/check_care.png', events: '../work/dash/check_events.png' };
const shotAt = (t) => DASH.find(([a, b]) => t >= a && t < b);
function sourceUrl(t) {
  if (t < 10) return vcUrl(t);
  if (t < 34) { const s = shotAt(t); return typeof s[2] === 'string' ? STILL[s[2]] : castUrl(s[2] + (t - s[0])); }
  if (t < 38.6) return closeUrl(t);
  return 'assets/stars.png';
}

// ------------------------------------------------------------ drawing
let CUR = null;  // the image for this frame, set by seek before draw
function view(ctx, img, [cx, cy, z], sw, sh) {   // draw img so that (cx, cy) of the source is centred at zoom z
  const s = (W / sw) * z, vw = W / s, vh = H / s;
  const x0 = clamp(cx * sw - vw / 2, 0, sw - vw), y0 = clamp(cy * sh - vh / 2, 0, sh - vh);
  ctx.drawImage(img, x0, y0, vw, vh, 0, 0, W, H);
}
const lerp3 = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] * (q[2] / p[2]) ** k];

function kick(t) {
  let s = 1;
  for (const k of KICKS) if (t >= k && t < k + 0.6) s += 0.055 * Math.exp(-(t - k) * 9);
  return s;
}
function shakeXY(t) {
  let x = 0, y = 0;
  for (const [k, amp] of SHAKES) if (t >= k && t < k + 0.5) {
    const d = Math.exp(-(t - k) * 10) * amp;
    x += d * (M.noise1(t * 40, 3) * 2 - 1); y += d * (M.noise1(t * 40, 9) * 2 - 1);
  }
  return [x, y];
}

function labels(ctx, t) {
  for (const L of plan.labels) {
    if (t < L.times[0] || t >= L.end) continue;
    let n = 0; while (n < L.times.length && L.times[n] <= t) n++;
    const typing = n < L.text.length || t < L.times[L.times.length - 1] + 0.4;
    const str = L.text.slice(0, n) + (typing && Math.floor(t * 4) % 2 === 0 ? '_' : '');
    ctx.font = `${L.size}px ${UI}`;
    const full = ctx.measureText(L.text).width;
    const x = L.align === 'center' ? L.x - full / 2 : L.align === 'right' ? L.x - full : L.x;
    if (t >= 10 && t < 34) {  // over the dashboard: a dark plate keeps the type readable on a phone
      ctx.fillStyle = 'rgba(4,6,10,0.78)';
      ctx.fillRect(x - 18, L.y - L.size * 0.95, ctx.measureText(L.text.slice(0, n) + '_').width + 36, L.size * 1.35);
    }
    ctx.fillStyle = L.color; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, L.y);
  }
}

function draw(ctx, u, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const img = CUR;
  const [sx, sy] = shakeXY(t);
  ctx.save();
  const k = kick(t); ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
  if (img && t < 10) ctx.drawImage(img, 0, 0, W, H);
  else if (img && t < 34) {
    const [a, b, , v0, v1] = shotAt(t);
    view(ctx, img, lerp3(v0, v1, E.inOutSine(clamp((t - a) / (b - a)))), img.naturalWidth, img.naturalWidth * 9 / 16);
  } else if (img && t < 38.6) ctx.drawImage(img, 0, 0, W, H);
  else if (img) {  // end card: stars drift in, title lands on the boom
    const z = 1.0 + 0.012 * (t - 38.6);
    ctx.drawImage(img, (W - img.naturalWidth * z) / 2, (H - img.naturalHeight * z) / 2, img.naturalWidth * z, img.naturalHeight * z);
  }
  ctx.restore();

  // grade: dashboard shots darkened at the edges so they sit in the film's black world
  if (t >= 10 && t < 34) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (t >= 13.58 && t < 13.58 + 0.5) {  // the alert: a red pulse at the edges, not a flash
    const a = 0.45 * Math.exp(-(t - 13.58) * 6);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.0);
    g.addColorStop(0, 'rgba(255,40,40,0)'); g.addColorStop(1, `rgba(255,40,40,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (t >= 38.6) {
    const p = clamp((t - 38.6) / 0.25), s = 1.04 - 0.04 * E.outCubic(p);
    ctx.save(); ctx.translate(W / 2, 520); ctx.scale(s, s);
    ctx.font = `600 124px ${DISPLAY}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('PEARSON-SPECTER', 0, 0);
    ctx.restore(); ctx.textAlign = 'left';
  }
  labels(ctx, t);
  if (t > 42.8) { ctx.fillStyle = `rgba(0,0,0,${clamp((t - 42.8) / 0.8)})`; ctx.fillRect(0, 0, W, H); }
}

function post(ctx, u, t) {  // fine grain over everything (seeded, per frame)
  const r = M.mulberry32(Math.floor(t * 30) + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 1400; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
}

await M.film({ draw, post, hits: HITS, samples: 1, fonts: [`124px ${DISPLAY}`, `40px ${UI}`] });
const seekNow = window.seek;
window.seek = async (t) => { CUR = await load(sourceUrl(t + 0.5 / 30)); seekNow(t); };
await window.seek(0);

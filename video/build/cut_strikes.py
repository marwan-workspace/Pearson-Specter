"""Find each keystroke in the reference recording and save it as its own short, normalized sample."""
import array, os, sys, wave

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
w = wave.open(SRC); sr = w.getframerate()
x = array.array("h", w.readframes(w.getnframes())); x = [v / 32768 for v in x]

# envelope: max |x| over 2 ms windows
hop = int(0.002 * sr)
env = [max(abs(v) for v in x[i:i + hop]) for i in range(0, len(x) - hop, hop)]
noise = sorted(env)[len(env) // 2]
thr = max(noise * 6, max(env) * 0.12)

onsets, last = [], -1e9
for i in range(1, len(env)):
    t = i * hop / sr
    if env[i] >= thr and env[i - 1] < thr and t - last > 0.07:  # a new strike, at least 70 ms after the previous
        onsets.append(i * hop); last = t

strikes = []
for k, s in enumerate(onsets):
    start = max(0, s - int(0.004 * sr))
    nxt = onsets[k + 1] - int(0.004 * sr) if k + 1 < len(onsets) else len(x)
    end = min(nxt, start + int(0.16 * sr))
    seg = x[start:end]
    if len(seg) < int(0.03 * sr): continue
    peak = max(abs(v) for v in seg)
    fade = int(0.012 * sr)
    seg = [v / peak * 0.9 * min(1.0, (len(seg) - i) / fade) for i, v in enumerate(seg)]
    strikes.append((start / sr, peak, seg))

# keep the clearer strikes: drop the faintest quarter (they are mostly bleed and room noise)
peaks = sorted(p for _, p, _ in strikes)
cut = peaks[len(peaks) // 4]
kept = [s for s in strikes if s[1] >= cut]
for n, (t, p, seg) in enumerate(kept):
    with wave.open(os.path.join(OUT, f"strike{n:02d}.wav"), "wb") as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr)
        o.writeframes(array.array("h", (int(v * 32767) for v in seg)).tobytes())
print(f"found {len(strikes)} strikes, kept {len(kept)}; sample rate {sr}")
print("times:", " ".join(f"{t:.2f}" for t, _, _ in kept))

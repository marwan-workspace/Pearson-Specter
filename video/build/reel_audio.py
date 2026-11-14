"""Scenes 02-05 (video/reel): the typed HUD plan, its real keystrokes, heartbeat, voices, and the one score.

Writes
  ../reel/plan.json      typed labels with per-character times (the film draws exactly these)
  ../work/reel_fx.wav    keys + heartbeat + voices (FX chain from vid.VOICE_FX), reel time
  ../work/score.wav      the score for the WHOLE video, global time (hook + problem + reel)
Reel time 0 = global 37.08 s (after 00-hook 16.47 s and 01-problem 20.61 s).
"""
import json, math, os, random, subprocess
import numpy as np
import vid

HERE = vid.SCRATCH
REEL0 = 16.47 + 20.61
DUR = 43.6
TOTAL = REEL0 + DUR
SR = vid.SR
VOICES = {"03-vitacuff": 0.5, "04-emergency": 10.6, "05-mars": 28.3, "06-close": 34.2}
words = {k: json.load(open(os.path.join(HERE, "vo", k + ".json"))) for k in VOICES}


def w(sec, word, n=0):
    hits = [a for a, b, t in words[sec] if t.strip(".,") == word]
    return VOICES[sec] + hits[n]


WHITE, GREY, RED = "#FFFFFF", "#9AA3B2", "#FF4D4D"
labels, sfx = [], vid.Track(DUR)
rng = random.Random(5)


def label(text, start, end, x, y, size, color=WHITE, key=0.35, times=None, align="left", seed=0):
    if times is None: times, _ = vid.type_times(text, start, rng, lo=0.045, hi=0.075, stop_pause=0)
    labels.append({"text": text, "times": [round(t, 3) for t in times], "end": end, "x": x, "y": y, "size": size, "color": color, "align": align})
    if key: vid.typewriter_sound(sfx, times, text, gain=key, seed=seed)


def instant(text, start, end, x, y, size, color=WHITE, key=0.35):  # a value that swaps in with one strike
    label(text, start, end, x, y, size, color, key=0, times=[start] * len(text))
    if key: vid.typewriter_sound(sfx, [start], text[0], gain=key, seed=int(start * 10))


# ---- 02 VitaCuff (0-10)
vc = w("03-vitacuff", "VitaCuff")
label("VITACUFF", vc, 4.40, 120, 900, 84, seed=1)
label("WRIST MEDICAL UNIT", w("03-vitacuff", "medical") + 0.05, 4.40, 124, 958, 32, GREY, key=0.25, seed=2)
label("HEART RATE  72", w("03-vitacuff", "Reading") + 0.1, 6.93, 1500, 470, 38, seed=3)
label("SpO2        98%", w("03-vitacuff", "body"), 6.93, 1500, 530, 38, seed=4)
label("TEMP      36.7 C", w("03-vitacuff", "every") + 0.15, 6.93, 1500, 590, 38, seed=5)
label("SYRINGE BAY", 7.02, 8.90, 120, 150, 40, GREY, key=0.25, seed=6)
instant("1/3 LOADED", 7.62, 8.10, 120, 214, 52)
instant("2/3 LOADED", 8.10, w("03-vitacuff", "board"), 120, 214, 52)
instant("3/3 LOADED", w("03-vitacuff", "board"), 8.90, 120, 214, 52)
label("CONCEPT  -  VITALS SIMULATED", -1, 10.0, 1800, 1030, 22, GREY, key=0, times=[-1] * 28, align="right")

# ---- 03 emergency (10-28)
label("SIMULATED EVENT: BRADYCARDIA", 11.45, 13.55, 110, 1000, 34, seed=7)
label("DETECTED IN 9 S", w("04-emergency", "watch") - 0.1, 16.1, 110, 1000, 40, RED, seed=8)  # real elapsed time in the capture
label("MACHINE LEARNING: NOT EXERCISE", w("04-emergency", "Machine"), 18.85, 110, 1000, 34, seed=9)
label("AI DECIDES - RULE BOOK HAS THE LAST WORD", w("04-emergency", "AI"), 23.3, 110, 1000, 34, seed=10)
label("ATROPINE: HELD FOR DOSE REVIEW", w("04-emergency", "dose"), 25.2, 110, 1000, 36, seed=11)
label("CREW ALERTED", w("04-emergency", "crew"), 28.0, 110, 1000, 40, RED, seed=12)

# ---- 04 Mars (28-34)
label("EARTH LINK: DOWN", w("05-mars", "late") + 0.15, 34.0, 110, 1000, 40, RED, seed=13)

# ---- 05 close (34-38.6), typed with the voice
line = "They carry the doctor with them."
a, b = w("06-close", "they") - 0.05, w("06-close", "them") + 0.2
tt = [a + (b - a) * i / (len(line) - 1) for i in range(len(line))]
label(line, a, 38.6, 960, 960, 56, times=tt, align="center", key=0.3, seed=14)

label("CREW HEALTH SYSTEM", 39.25, 99, 960, 640, 40, GREY, align="center", key=0.25, seed=15)
label("SPACE APPS CHALLENGE 2026 - AMMAN", 40.1, 99, 960, 980, 28, GREY, align="center", key=0.2, seed=16)
json.dump({"labels": labels, "voices": VOICES}, open(os.path.join(HERE, "..", "reel", "plan.json"), "w"), indent=0)

# ---- heartbeat motif
vid.heartbeat(sfx, vid.accel_beats(4.45, 6.9, 66, 66, 4.5, lambda t: 0.3))                 # the unit reads a calm heart
crash = w("04-emergency", "crashes")
vid.heartbeat(sfx, vid.accel_beats(10.05, 13.5, 72, 34, crash, lambda t: 0.35 + 0.25 * min(1, (t - 10) / 2.5)))  # bradycardia: the beat drags
vid.heartbeat(sfx, vid.accel_beats(14.4, 23.3, 38, 38, 14.5, lambda t: 0.22))             # slow and low under the pipeline
vid.heartbeat(sfx, vid.accel_beats(24.0, 27.8, 50, 64, 26.0, lambda t: 0.25))            # after the injection the rate comes back
vid.heartbeat(sfx, vid.accel_beats(34.3, 38.4, 60, 60, 34.4, lambda t: 0.2))              # the close: steady
vid.boom(sfx, 38.6, gain=0.9)
vid.boom(sfx, vc, gain=0.55)
vid.boom(sfx, 13.58, gain=0.6)

fx_wav = os.path.join(HERE, "..", "work", "reel_keys_heart.wav"); sfx.save(fx_wav)

# voices with the deep-space FX, placed on the reel clock, mixed with keys + heart
inputs, graph = ["-i", fx_wav], []
for i, (k, at) in enumerate(VOICES.items(), start=1):
    inputs += ["-i", os.path.join(HERE, "vo", k + "-raw.mp3")]
    graph.append(f"[{i}:a]{vid.VOICE_FX},adelay={int(at * 1000)}:all=1,apad[v{i}]")
graph.append("[0:a]volume=0.55,apad[s]")
graph.append("[s][v1][v2][v3][v4]amix=inputs=5:duration=first:normalize=0,aresample=48000[a]")
subprocess.run([vid.FF, "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", "[a]", "-t", str(DUR), "-ac", "2",
                os.path.join(HERE, "..", "work", "reel_fx.wav")], check=True)

# ---- the score: one low pulsing bed for the whole video (global time), stdlib-free numpy synth
n = int(TOTAL * SR); t = np.arange(n) / SR
G = lambda x: REEL0 + x  # reel time -> global


def env(keys):  # piecewise-linear envelope from [(time, level), ...]
    k = np.array(keys); return np.interp(t, k[:, 0], k[:, 1])


def lp(x, fc):  # one-pole low-pass, fc may be an array
    a = np.exp(-2 * np.pi * np.broadcast_to(fc, x.shape) / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a[i]) * x[i] + a[i] * s; y[i] = s
    return y


rngn = np.random.default_rng(3)
saw = lambda f: 2 * ((t * f) % 1) - 1
drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.41 * t + 1) + 0.35 * saw(55.15) * 0.5 + 0.25 * saw(54.85) * 0.5)
drone *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.09 * t)
drone_env = env([(0, 0), (16.6, 0), (24, 0.10), (36.5, 0.22), (G(0), 0.30), (G(10), 0.32), (G(13.5), 0.20), (G(13.58), 0.38), (G(28), 0.38),
                 (G(28.3), 0.16), (G(34), 0.14), (G(38.6), 0.0), (TOTAL, 0)])

# 8th-note pulse at 120 bpm, locked so a beat lands on "VitaCuff"
P0, step = G(vc), 0.25
ph = ((t - P0) % step) / step
pulse_amp = np.exp(-ph * 9) * (t >= P0)
pulse_tone = saw(110) * 0.6 + saw(110.4) * 0.4
accent = np.where(np.floor((t - P0) / step) % 4 == 0, 1.0, 0.6)
pulse_env = env([(0, 0), (P0 - 0.01, 0), (P0, 0.45), (G(10), 0.5), (G(10.05), 0.0), (G(13.5), 0.0), (G(13.58), 0.75), (G(23.3), 0.75),
                 (G(28), 0.6), (G(28.05), 0), (TOTAL, 0)])
cut = env([(0, 300), (G(10), 500), (G(13.58), 1400), (G(23.3), 900), (TOTAL, 900)])
pulse = lp(pulse_tone * pulse_amp * accent, cut) * pulse_env * 1.8

# riser into the alert, and a warm chord for the close (A minor add9, low)
rise_env = env([(0, 0), (G(11.6), 0), (G(13.56), 1), (G(13.58), 0), (TOTAL, 0)]) ** 2
riser = lp(rngn.standard_normal(n), 200 + 3000 * rise_env) * rise_env * 0.5
chord = sum(np.sin(2 * np.pi * f * t) * g for f, g in [(110, 0.5), (164.81, 0.35), (220, 0.3), (246.94, 0.18), (261.63, 0.22)])
chord_env = env([(0, 0), (G(34), 0), (G(36.5), 0.28), (G(38.6), 0.34), (G(41.5), 0.22), (TOTAL - 0.3, 0), (TOTAL, 0)])
score = drone * drone_env + pulse + riser + chord * chord_env
score = np.tanh(score * 0.9) * 0.5
st = np.stack([score, np.roll(score, 240)], 1)  # 5 ms offset for a little width
import wave
with wave.open(os.path.join(HERE, "..", "work", "score.wav"), "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())
print("plan:", len(labels), "labels; reel", DUR, "s; total", round(TOTAL, 2), "s")

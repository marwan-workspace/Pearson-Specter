"""Shared pieces for the video clips: a tiny sound synth (stdlib only) and typewriter text for ffmpeg."""
import array, math, os, random, subprocess, wave

SR = 48000
SCRATCH = os.path.dirname(os.path.abspath(__file__))
import imageio_ffmpeg
FF = os.environ.get("FFMPEG") or imageio_ffmpeg.get_ffmpeg_exe()  # bundled ffmpeg from the imageio-ffmpeg package
MONO = "C\\:/Windows/Fonts/consola.ttf"
TITLE = "C\\:/Windows/Fonts/seguisb.ttf"
LIGHT = "C\\:/Windows/Fonts/segoeuil.ttf"
VOICE_FX = ("highpass=f=60,lowpass=f=8000,bass=g=5:f=110,equalizer=f=2500:t=q:w=1:g=2,"
            "aecho=0.8:0.7:60|120|180:0.28|0.18|0.1,volume=1.5")


class Track:
    def __init__(self, seconds):
        self.buf = [0.0] * int(seconds * SR)

    def add(self, start, samples, gain=1.0):
        i0 = int(start * SR)
        for i, s in enumerate(samples):
            j = i0 + i
            if 0 <= j < len(self.buf): self.buf[j] += s * gain

    def save(self, path):
        peak = max(1e-9, max(abs(x) for x in self.buf))
        scale = min(1.0, 0.98 / peak)  # never clip; quieter tracks stay as mixed
        data = array.array("h", (int(max(-1, min(1, x * scale)) * 32767) for x in self.buf))
        with wave.open(path, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())


def _kick(f_hi, f_lo, sweep, decay, length, drive):
    out, phase = [], 0.0
    for i in range(int(length * SR)):
        t = i / SR
        f = f_lo + (f_hi - f_lo) * math.exp(-t * sweep)
        phase += 2 * math.pi * f / SR
        env = min(1.0, t / 0.003) * math.exp(-t * decay)
        out.append(math.tanh(drive * math.sin(phase) * env) / math.tanh(drive))
    return out


_LUB = _kick(140, 46, 30, 13, 0.32, 3.0)   # heavy, a little distorted: audible on laptop speakers too
_DUB = _kick(165, 55, 34, 16, 0.26, 2.6)


def heartbeat(track, beats):
    """beats: list of (time, gain). Each beat is lub then a softer dub."""
    for t, g in beats:
        track.add(t, _LUB, g)
        track.add(t + 0.16, _DUB, g * 0.72)


def accel_beats(start, stop, bpm_from, bpm_to, ramp_end, gain_fn):
    beats, t = [], start
    while t < stop:
        k = min(1.0, max(0.0, (t - start) / max(1e-6, ramp_end - start)))
        bpm = bpm_from + (bpm_to - bpm_from) * k
        beats.append((t, gain_fn(t)))
        t += 60 / bpm
    return beats


def _resonate(x, freq, decay_s, gain):
    """Two-pole resonator: rings at freq, dying away over decay_s. The modes of the metal frame."""
    r = math.exp(-1 / (decay_s * SR)); c = 2 * r * math.cos(2 * math.pi * freq / SR); r2 = r * r
    y1 = y2 = 0.0; out = []
    for s in x:
        y = s + c * y1 - r2 * y2; y2, y1 = y1, y; out.append(y * gain)
    return out


# inharmonic modes of a cast-iron typewriter body and typebar (Hz, ring time s, level)
_MODES = [(150, 0.020, 0.45), (430, 0.016, 0.55), (1050, 0.012, 0.75), (1800, 0.009, 0.65), (2700, 0.006, 0.45), (4100, 0.004, 0.25)]


def _click(rng, soft=False):
    """Vintage typewriter: soft key-down, then the typebar slams the platen, then one small bounce."""
    n = int(0.11 * SR)
    excite = [0.0] * n
    def burst(at, length, amp):
        for i in range(int(length * SR)):
            j = int(at * SR) + i
            if j < n: excite[j] += (rng.random() * 2 - 1) * amp * (1 - i / (length * SR))
    strike = 0.018 + rng.uniform(-0.003, 0.003)
    burst(0.0, 0.004, 0.10)                 # key going down
    burst(strike, 0.0025, 1.0)              # typebar hits the platen
    burst(strike + 0.016, 0.0015, 0.22)     # bounce
    out = [0.0] * n
    for f, d, g in _MODES:
        f *= rng.uniform(0.96, 1.04)        # every key sounds a little different
        ring = _resonate(excite, f, d, 1.0)
        peak = max(1e-9, max(abs(v) for v in ring))  # low modes ring far louder; level each by its own peak
        for i, v in enumerate(ring): out[i] += v * g / peak
    tail = int(0.03 * SR)
    for i in range(n):
        fade = min(1.0, (n - i) / tail)     # no pop when the buffer ends
        out[i] = math.tanh(out[i] * 0.9) * fade * (0.5 if soft else 1.0)
    return out


_STRIKES = None


def _load_strikes():
    """Real keystrokes cut from the reference recording (ref/strikes, made by cut_strikes.py)."""
    global _STRIKES
    if _STRIKES is None:
        d = os.path.join(SCRATCH, "ref", "strikes"); _STRIKES = []
        for f in sorted(os.listdir(d)):
            with wave.open(os.path.join(d, f)) as w:
                assert w.getframerate() == SR, f"{f}: expected {SR} Hz"
                s = [v / 32768 for v in array.array("h", w.readframes(w.getnframes()))]
            # level by body (RMS of the first 40 ms), not by the needle-thin click peak, then soft-limit the click
            head = s[:int(0.04 * SR)]
            rms = math.sqrt(sum(v * v for v in head) / len(head))
            _STRIKES.append([math.tanh(v * 0.22 / rms) for v in s])
    return _STRIKES


def typewriter_sound(track, times, text, gain=0.5, seed=7):
    rng = random.Random(seed); strikes = _load_strikes(); prev = -1
    for t, ch in zip(times, text):
        k = rng.randrange(len(strikes))
        if k == prev: k = (k + 1) % len(strikes)  # never the same key twice in a row
        prev = k
        track.add(t, strikes[k], gain * (0.6 if ch == " " else rng.uniform(0.85, 1.0)))


def flatline(track, start, end, gain=0.05):
    n = int((end - start) * SR)
    track.add(start, [math.sin(2 * math.pi * 880 * i / SR) * max(0, 1 - i / n) for i in range(n)], gain)


def boom(track, t, gain=0.8):
    hit = _kick(90, 28, 9, 3.2, 1.6, 1.6)
    rng = random.Random(3)
    noise = [(rng.random() * 2 - 1) * math.exp(-i / SR * 18) * 0.25 for i in range(int(0.3 * SR))]
    track.add(t, hit, gain); track.add(t, noise, gain)


def drone(track, start, end, gain=0.1):
    n = int((end - start) * SR)
    out = []
    for i in range(n):
        t = i / SR
        lfo = 0.6 + 0.4 * math.sin(2 * math.pi * 0.11 * t)
        fade = min(1, t / 1.5, (n / SR - t) / 1.5)
        s = math.sin(2 * math.pi * 55 * t) + 0.6 * math.sin(2 * math.pi * 82.4 * t + 1) + 0.3 * math.sin(2 * math.pi * 110.3 * t)
        out.append(s * lfo * fade / 1.9)
    track.add(start, out, gain)


def type_times(text, start, rng, lo=0.07, hi=0.12, stop_pause=0.22):
    """Irregular human typing: one time per character, a pause after a full stop."""
    times, t = [], start
    for ch in text:
        times.append(t)
        t += rng.uniform(lo, hi) + (stop_pause if ch == "." else 0)
    return times, t


def esc(s):
    return s.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")


def typed_text(text, times, x, y, size, fade_at=None, fade_len=0.6, cursor_until=None, font=MONO, color="white"):
    """drawtext filters that reveal text one character at a time at the given times, with a cursor while typing."""
    parts, end = [], times[-1] + 0.001
    for i in range(1, len(text) + 1):
        t0, t1 = times[i - 1], (times[i] if i < len(text) else end)
        parts.append(f"drawtext=fontfile='{font}':text='{esc(text[:i])}_':fontsize={size}:fontcolor={color}:x={x}:y={y}:enable='between(t,{t0:.3f},{t1:.3f})'")
    alpha = "1" if fade_at is None else f"if(lt(t,{fade_at}),1,max(0,1-(t-{fade_at})/{fade_len}))"
    parts.append(f"drawtext=fontfile='{font}':text='{esc(text)}':fontsize={size}:fontcolor={color}:x={x}:y={y}:alpha='{alpha}':enable='gte(t,{end:.3f})'")
    if cursor_until:
        parts.append(f"drawtext=fontfile='{font}':text='{esc(text)}_':fontsize={size}:fontcolor={color}:x={x}:y={y}:enable='gte(t,{end:.3f})*lt(t,{cursor_until})*lt(mod(t,1),0.5)'")
    return parts


def mono_x(text, size):
    return int((1920 - size * 0.5498 * len(text)) / 2)  # Consolas: every glyph is 0.5498 em wide


def render(out, dur, video_filters, sfx_wav, voice_mp3, voice_at, background=None, sfx_gain=1.0):
    graph = []
    graph.append("[0:v]" + ",".join(video_filters) + ",format=yuv420p[v]")
    graph.append(f"[1:a]volume={sfx_gain}[sfx]")
    graph.append(f"[2:a]{VOICE_FX},adelay={int(voice_at * 1000)}:all=1,apad[vo]")
    graph.append("[sfx][vo]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11[a]")
    script = os.path.join(SCRATCH, os.path.basename(out) + ".filter.txt")
    open(script, "w", encoding="utf-8").write(";\n".join(graph))
    bg = background or ["-f", "lavfi", "-i", f"color=c=black:s=1920x1080:r=30:d={dur}"]
    cmd = [FF, "-loglevel", "error", "-y", *bg, "-i", sfx_wav, "-i", voice_mp3,
           "-/filter_complex", script, "-map", "[v]", "-map", "[a]", "-t", str(dur),
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out]
    subprocess.run(cmd, check=True)
    print("wrote", out)

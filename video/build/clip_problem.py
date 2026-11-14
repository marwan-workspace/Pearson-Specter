"""0:16-0:36 problem: starfield drift, the four slow dangers typed in sync with the voice, then the team title on a boom."""
import json, os, random, sys
import vid

OUT = sys.argv[1]
VO = os.path.join(vid.SCRATCH, "vo")
words = json.load(open(os.path.join(VO, "02-problem.json")))
first = {}
for a, b, t in words: first.setdefault(t, (a, b))

VOICE_AT = 0.6
at = lambda word: VOICE_AT + first[word][0]
DUR = round(VOICE_AT + words[-1][1] + 2.0, 2)

# starfield, written as a plain grayscale image (no dependencies)
stars = os.path.join(vid.SCRATCH, "stars.pgm")
if not os.path.exists(stars):
    rng = random.Random(5); W, H = 2112, 1188  # 10% larger than the frame so the slow zoom never shows an edge
    px = bytearray(W * H)
    for _ in range(1400):
        x, y = rng.randrange(W - 1), rng.randrange(H - 1); v = int(rng.random() ** 1.6 * 200) + 55
        r = 2 if v > 200 else 1 if v > 120 else 0  # brighter stars are drawn bigger so they survive scaling
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                xx, yy = x + dx, y + dy
                if 0 <= xx < W and 0 <= yy < H: px[yy * W + xx] = max(px[yy * W + xx], v if dx == dy == 0 else v * 2 // 3)
    open(stars, "wb").write(b"P5\n%d %d\n255\n" % (W, H) + bytes(px))

# the four dangers, typed on stacked lines as the voice names each one
LINES = [("Radiation.", "radiation"), ("Bone loss.", "Bones"), ("No sleep.", "Sleep"), ("Isolation.", "isolation")]
SIZE, LH = 60, 92
x = vid.mono_x("Radiation.", SIZE)
y0 = 1080 // 2 - (len(LINES) * LH) // 2
FADE_AT = at("Small") - 0.3
rng = random.Random(21)
sfx = vid.Track(DUR)
vid.drone(sfx, 0, DUR, gain=0.09)
filters = ["scale=w='2112*(1+0.00012*n)':h=-2:eval=frame", "crop=1920:1080", "eq=brightness=0.02"]
for i, (text, word) in enumerate(LINES):
    times, _ = vid.type_times(text, at(word) - 0.05, rng, lo=0.055, hi=0.08, stop_pause=0)
    filters += vid.typed_text(text, times, x, y0 + i * LH, SIZE, fade_at=FADE_AT, fade_len=0.7)
    vid.typewriter_sound(sfx, times, text, gain=0.75, seed=30 + i)

# team title on a low boom when the voice says the name
T_AT = at("Pearson-Specter") - 0.1
SUB_AT = at("crew")
title_alpha = f"min(1,(t-{T_AT})/0.5)"
filters.append(f"drawtext=fontfile='{vid.TITLE}':text='PEARSON-SPECTER':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-50:alpha='{title_alpha}':enable='gte(t,{T_AT})'")
filters.append(f"drawtext=fontfile='{vid.LIGHT}':text='Crew health system':fontsize=52:fontcolor=0xBFC7D5:x=(w-text_w)/2:y=(h)/2+60:alpha='min(1,(t-{SUB_AT})/0.6)':enable='gte(t,{SUB_AT})'")
filters.append(f"fade=t=in:st=0:d=0.6")
vid.boom(sfx, T_AT, gain=0.75)
wav = os.path.join(vid.SCRATCH, "problem_sfx.wav"); sfx.save(wav)

bg = ["-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", stars]
vid.render(OUT, DUR, filters, wav, os.path.join(VO, "02-problem-raw.mp3"), VOICE_AT, background=bg, sfx_gain=1.7)
print(f"duration {DUR}s, title at {T_AT:.2f}s")

"""0:37-0:48 VitaCuff: captured 3D footage + typed labels in the hook's typewriter style, voice, soft heartbeat on the screen shot."""
import json, os, random, sys
import vid

OUT, FRAMES = sys.argv[1], sys.argv[2]
VO = os.path.join(vid.SCRATCH, "vo")
words = json.load(open(os.path.join(VO, "03-vitacuff.json")))
first = {}
for a, b, t in words: first.setdefault(t, a)
VOICE_AT = 0.5
at = lambda w: VOICE_AT + first[w]
WITH2 = VOICE_AT + [a for a, b, t in words if t == "with"][-1]  # "with" is said twice; the second one starts "with its own medicine"
DUR = 10.8

rng = random.Random(41)
sfx = vid.Track(DUR)
vid.drone(sfx, 0, DUR, gain=0.07)
filters = ["crop=1904:1071:8:6", "scale=1920:1080:flags=lanczos"]  # trims a 3-px white strip the page shows at the top while scrolling

def label(text, start, fade_at, x, y, size, color="white", key_gain=0.5, seed=0):
    times, _ = vid.type_times(text, start, rng, lo=0.05, hi=0.08, stop_pause=0)
    filters.extend(vid.typed_text(text, times, x, y, size, fade_at=fade_at, fade_len=0.4, color=color))
    vid.typewriter_sound(sfx, times, text, gain=key_gain, seed=seed)

X, Y = 120, 860
label("VITACUFF", at("VitaCuff"), at("Reading") - 0.6, X, Y, 64, seed=1)
label("wrist medical unit", at("medical") + 0.1, at("Reading") - 0.6, X, Y + 84, 32, color="0xBFC7D5", key_gain=0.3, seed=2)
label("LIVE VITALS", at("Reading") + 0.2, WITH2 - 0.4, X, Y + 40, 52, seed=3)
label("3 PREFILLED SYRINGES", at("medicine"), DUR - 0.5, X, 120, 52, seed=4)  # top left: the arm fills the lower half in this shot
# honesty note, always on
filters.append(f"drawtext=fontfile='{vid.LIGHT}':text='Concept  ·  vitals simulated':fontsize=24:fontcolor=0x8A93A3:x=w-text_w-60:y=h-60")
filters.append("fade=t=in:st=0:d=0.35")

# the unit's own heartbeat comes back, resting and soft, while the camera is on its live screen
beats = vid.accel_beats(at("Reading") - 0.3, WITH2 - 0.2, 66, 66, at("Reading"), lambda t: 0.35)
vid.heartbeat(sfx, beats)
wav = os.path.join(vid.SCRATCH, "vitacuff_sfx.wav"); sfx.save(wav)

bg = ["-framerate", "30", "-i", os.path.join(FRAMES, "f%04d.jpg")]
vid.render(OUT, DUR, filters, wav, os.path.join(VO, "03-vitacuff-raw.mp3"), VOICE_AT, background=bg, sfx_gain=0.4)

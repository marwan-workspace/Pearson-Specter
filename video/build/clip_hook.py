"""0:00-0:15 hook: typed title + racing heartbeat, deep voice, heartbeat dies on 'heart stops', flatline."""
import json, os, random, sys
import vid

OUT = sys.argv[1]
VO = os.path.join(vid.SCRATCH, "vo")
words = json.load(open(os.path.join(VO, "01-hook.json")))
w = {t: (a, b) for a, b, t in words}

TEXT = "Mars. 20 minutes from the nearest doctor."
SIZE = 64
times, typed_end = vid.type_times(TEXT, 1.0, random.Random(11))
FADE_AT = typed_end + 0.9
VOICE_AT = FADE_AT + 0.4
HEART = VOICE_AT + w["heart"][0]
STOPS_END = VOICE_AT + w["stops"][1]
DUR = round(VOICE_AT + words[-1][1] + 0.9, 2)

sfx = vid.Track(DUR)
# racing heartbeat: 82 -> 128 bpm while the title types, keeps racing under the voice, last beat lands on 'heart'
loud = lambda t: 0.6 if t < typed_end else 1.0 if t < VOICE_AT else 0.55  # under the keys, surge before the voice, under the voice
beats = vid.accel_beats(0.0, HEART + 0.01, 82, 128, VOICE_AT, loud)
vid.heartbeat(sfx, beats)
vid.typewriter_sound(sfx, times, TEXT, gain=0.8)
vid.flatline(sfx, STOPS_END + 0.1, DUR, gain=0.06)
wav = os.path.join(vid.SCRATCH, "hook_sfx.wav"); sfx.save(wav)

y = 1080 // 2 - SIZE // 2
filters = vid.typed_text(TEXT, times, vid.mono_x(TEXT, SIZE), y, SIZE, fade_at=FADE_AT, cursor_until=FADE_AT)
vid.render(OUT, DUR, filters, wav, os.path.join(VO, "01-hook-raw.mp3"), VOICE_AT)
print(f"typed by {typed_end:.2f}s, voice at {VOICE_AT:.2f}s, last beat {beats[-1][0]:.2f}s, duration {DUR}s")

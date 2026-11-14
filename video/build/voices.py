"""Generate every voiceover section in the 'deep Andrew' voice, raw (no FX), plus word timings as JSON."""
import asyncio, json, os, sys
import edge_tts

OUT = sys.argv[1]
SECTIONS = {
    "01-hook": "On the way to Mars... a message to Earth takes up to twenty minutes. If an astronaut's heart stops... nobody on Earth can help in time.",
    "02-problem": "And it's not only emergencies. Every day in space... radiation builds up. Bones get weaker. Sleep breaks down. And the isolation... keeps growing. Small problems quietly become big ones. ... We're Pearson-Specter. This is our crew health system.",
    "03-vitacuff": "It starts with VitaCuff... a medical unit on the wrist. Reading the body, every second... with its own medicine on board.",
    "04-emergency": "Now... Hiro's heart rate crashes. In seconds, the watch catches it. Machine learning rules out exercise. An AI picks the condition... from a rule book it can't overrule. The dose is checked first. The crew... is alerted.",
    "05-mars": "At Mars, Earth answers too late. So the ship... becomes the doctor.",
    "06-close": "Twenty minutes from help... they carry the doctor... with them.",
}

async def one(name, text):
    c = edge_tts.Communicate(text, "en-US-AndrewNeural", rate="-14%", pitch="-10Hz", boundary="WordBoundary")
    words = []
    with open(os.path.join(OUT, name + "-raw.mp3"), "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([round(ch["offset"] / 1e7, 3), round((ch["offset"] + ch["duration"]) / 1e7, 3), ch["text"]])
    json.dump(words, open(os.path.join(OUT, name + ".json"), "w"))
    print(name, "ends at", words[-1][1], "s")

async def main():
    for k, v in SECTIONS.items():
        if os.path.exists(os.path.join(OUT, k + ".json")): continue
        for attempt in range(4):  # the free service drops requests now and then
            try: await one(k, v); break
            except edge_tts.exceptions.NoAudioReceived: await asyncio.sleep(2)
        else: raise SystemExit(f"{k}: no audio after 4 tries")

asyncio.run(main())

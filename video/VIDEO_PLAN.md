# The demo video (about 1:30): script, shots and how to finish it

**What it's for:** the video is the **hook** at the start of our 10-minute slot. It makes the judges feel the problem and see one moment of the system working. The talk after it covers the details, so the video skips them on purpose.

**The one idea it must land:** on the way to Mars, nobody can call a doctor, so the crew carries one with them.

**Rules (Amman & Aqaba T&C):** submit on the official Space Apps site by **3 PM, November 14**. The local rules ask for a 2 to 3 minute video, so **check with the organizers** whether a 1:30 hook is accepted as the submitted video. If not, we submit a longer cut.

---

## Status

| Part | Time | State |
|---|---|---|
| 1 · Hook | 0:00–0:16 | ✅ `clips/00-hook.mp4` |
| 2 · The problem + title | 0:16–0:37 | ✅ `clips/01-problem.mp4` |
| 3 · VitaCuff | 0:37–0:47 | ✅ in `final/pearson-specter-hook.mp4` (Motion Reel film `reel/`) |
| 4 · The emergency | 0:47–1:05 | ✅ same (real dashboard capture, Hiro) |
| 5 · Mars | 1:05–1:11 | ✅ same |
| 6 · Close + end card | 1:11–1:21 | ✅ same (new end card) |

**Final:** `final/pearson-specter-hook.mp4`, 1:20.7. Parts 3 to 6 below are now built; the shot list and Clipchamp steps are no longer needed. See `HANDOFF.md`.

**Voice:** AI voice ("deep Andrew"), all lines ready in `voiceover/`. **Sound:** heartbeat, typewriter and boom are built into the finished clips.

---

## Part 1: The script

### 0:00–0:16 · Hook ✅
Black screen. **"Mars. 20 minutes from the nearest doctor."** types out, with typewriter strikes and a racing heartbeat. The text fades.
> "On the way to Mars... a message to Earth takes up to twenty minutes. If an astronaut's heart stops... nobody on Earth can help in time."

The heartbeat dies on "heart stops", and a flatline tone fades out.

### 0:16–0:37 · The problem ✅
Drifting starfield. **Radiation. / Bone loss. / No sleep. / Isolation.** type in as each is named.
> "And it's not only emergencies. Every day in space... radiation builds up. Bones get weaker. Sleep breaks down. And the isolation... keeps growing. Small problems quietly become big ones. We're Pearson-Specter. This is our crew health system."

**PEARSON-SPECTER** lands on a low boom, with "Crew health system" under it.

### 0:37–0:47 · VitaCuff · `voiceover/03-vitacuff.mp3` (8 s)
| On screen | Voice |
|---|---|
| VitaCuff 3D page: the model turning slowly, then a scroll to the syringes. | "It starts with VitaCuff... a medical unit on the wrist. Reading the body, every second... with its own medicine on board." |

### 0:47–1:06 · The emergency · `voiceover/04-emergency.mp3` (16 s)
| On screen | Voice |
|---|---|
| Hiro's record, **Telemetry** tab: the 3D suit and heart trace. **Simulate → Bradycardia (tier 1) → confirm.** | "Now... Hiro's heart rate crashes." |
| The red alert banner appears. | "In seconds, the watch catches it." |
| The **Hybrid watch pipeline** panel (zoom in). | "Machine learning rules out exercise. An AI picks the condition... from a rule book it can't overrule." |
| **Care** tab: the injection with its cancel countdown. Then **Events** tab: crew alerts. | "The dose is checked first. The crew... is alerted." |

### 1:06–1:13 · Mars · `voiceover/05-mars.mp3` (5 s)
| On screen | Voice |
|---|---|
| Crew overview → **Mission controls**: Location **Mars**, one-way delay showing, then **mark the Earth link down**. | "At Mars, Earth answers too late. So the ship... becomes the doctor." |

### 1:13–1:23 · Close · `voiceover/06-close.mp3` (4 s)
| On screen | Voice |
|---|---|
| VitaCuff model turning slowly. | "Twenty minutes from help... they carry the doctor... with them." |
| `clips/07-endcard.mp4`: PEARSON-SPECTER, "Crew health system", "Space Apps Challenge 2026 · Amman". | *(boom, then silence)* |

---

## Part 2: The shot list (what you still record)

Sign in as **elena** before recording. Record each shot as its own clip, **2 takes each**, slow mouse.

| # | Shot | Where | Notes |
|---|---|---|---|
| 1 | VitaCuff turning | `localhost:3000/vitacuff/index.html` | 10 s of slow dragging. |
| 2 | Syringes | same page, scroll to the syringes | Let the animation finish. |
| 3 | Kwame's Telemetry | Crew overview → Kwame → Telemetry | Drag the suit slowly, 5 s of heart trace. |
| 4 | Inject bradycardia | Simulate → Bradycardia (tier 1) → confirm | Keep recording until the red banner shows. |
| 5 | Watch pipeline | Telemetry tab, scroll to "Hybrid watch pipeline" | |
| 6 | Countdown and alerts | **Care** tab, then **Events** tab | Catch the countdown while it's running. |
| 7 | Mars and link down | Crew overview → Mission controls | Show the delay, then mark the link down. |
| 8 | VitaCuff for the close | VitaCuff page, top | Same as shot 1, a different angle. |

**Before recording:** ask the team to stay off the dashboard (one shared database). Location Mars, Earth link up, Elena in command. If Kwame has old alerts, use **Hiro** and change the name in `04-emergency`.

**Recording without Game Bar:** **Win + Shift + R** (Snipping Tool) → drag over the whole screen → Start → ⏹ stop → **Ctrl + S**.

---

## Part 3: Putting it together in Clipchamp

1. New video, 16:9. Drag in, in order: `00-hook.mp4`, `01-problem.mp4`, your shots, `07-endcard.mp4`.
2. Drop `03-vitacuff.mp3`, `04-emergency.mp3`, `05-mars.mp3` and `06-close.mp3` onto the audio track under their shots.
3. Trim each shot so the picture changes when the line changes. **Cut out every loading wait.**
4. **Zoom** on the red banner, the pipeline and the countdown so they read on a phone.
5. Optional: very quiet ambient music under parts 3 to 6 (5 to 10%). Parts 1 and 2 already have their own sound.
6. Captions → auto-generate, then fix the wrong words.
7. Export 1080p MP4, watch it once all the way through, then upload (YouTube unlisted or Drive, "anyone with the link").

---

## AI and credits (global rules)
- The voiceover is AI text-to-speech: say so in the project description.
- Say that AI tools helped write the code.
- Credit the NASA suit model and the datasets in the description.

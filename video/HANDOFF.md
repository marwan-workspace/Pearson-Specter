# Handoff: the demo video (for the next session, with Motion Reel)

Read this first, then `VIDEO_PLAN.md`. Deadline: submit by **3 PM, November 14, 2026**.

## What the video is
A **~1:30 hook** that opens our 10-minute presentation. The talk covers the details; the video only has to grab the judges, make them feel the problem, and show one moment of the system working. The tone is a dark, tense space thriller.

## The user's taste (from feedback so far)
- Wants it to **demand attention**. "Captivating", "adrenaline". Calm and pretty isn't enough.
- **Voice:** "deep Andrew" (Microsoft `en-US-AndrewNeural`, rate -14%, pitch -10Hz, plus a deep-space FX chain: see `VOICE_FX` in `build/vid.py`). Rejected: Christopher, Jarvis-style British, female voices.
- **Heartbeat:** heavy and distorted, like a horror game (The Forest). It starts on frame 1, races 82→128 BPM, and **dies on "heart stops"**, then a flatline tone. The user loves this.
- **Typewriter:** must be the **real keystrokes** from the YouTube reference ("Typing Sound Effect (no copyright)", OJhWtBBJw10). They're cut into `build/ref/strikes/` (36 samples). Synthesized clicks were rejected twice. The keys sit at a **lower volume** under the heartbeat.
- Typed text uses Consolas, white on black. Clean, no gimmicky transitions.
- Doesn't want anything that looks AI-made or cheesy.

## Done and approved
| File | What |
|---|---|
| `clips/00-hook.mp4` (16.5 s) | Black, "Mars. 20 minutes from the nearest doctor." typed with real keys, racing heartbeat, deep voice, heartbeat dies on "heart stops", flatline. ✅ approved |
| `clips/01-problem.mp4` (20.6 s) | Starfield drift, "Radiation. / Bone loss. / No sleep. / Isolation." typed as they're named, PEARSON-SPECTER on a boom. ✅ approved |
| `clips/07-endcard.mp4` (5 s) | PEARSON-SPECTER, "Crew health system", "Space Apps Challenge 2026 · Amman" on stars. Not reviewed yet. |

## Rejected, to redo next
`clips/02-vitacuff.mp4`, the 3D wrist unit, 0:37–0:48, voice `vo/03-vitacuff`.
1. **Jittery.** Cause: Playwright `page.screenshot` sometimes captured the previous WebGL frame (the per-frame motion swings 4.3 → 1.2 → 4.5). Fix: read pixels straight from the canvas in the same task as the render (e.g. `canvas.toDataURL('image/jpeg', .95)` right after `__step`), or render the model directly in three.js with Motion Reel.
2. **Not captivating.** Ideas the user liked: hard cuts on a beat grid with whoosh and impact sounds, dark scene with a strong rim light, the unit emerging from black with a bass hit on "VitaCuff", stars behind the model, sci-fi HUD callouts typed in and pointing at parts ("HEART RATE 72", "SpO2 98%", "3/3 LOADED"), punch-in zooms, a slight shake on hits, a low pulsing music bed.
3. The model has **NASA logos** baked into its textures. The global rules forbid NASA branding that implies endorsement, so consider hiding them or ask the team.

How the current capture works: `build/vc_capture.py` fakes the page clock (`performance.now` and `requestAnimationFrame`) so each frame is exactly 1/30 s, hides the page UI, centres the camera (patches `setViewOffset`), and drives scroll and yaw from keyframes. The page is `localhost:3000/vitacuff/index.html` (three.js). `window.__vitacuff` exposes `{THREE, scene, camera, stages}`. The scroll sections are hero (0–1728), screen close-up (1728–3456) and syringe bay (3456–5184, syringes load with progress).

## Still to make (0:48–1:23)
- `04-emergency` (16 s): dashboard footage. Kwame's Telemetry tab (3D suit + ECG) → Simulate → Bradycardia (tier 1) → red alert banner → Hybrid watch pipeline → Care tab injection countdown → Events crew alerts.
- `05-mars` (5 s): Crew overview → Mission controls: Location Mars, delay showing, Earth link marked down.
- `06-close` (3.6 s): VitaCuff turning, "They carry the doctor… with them.", then the end card.

Dashboard: backend `cd backend && npm start` (port 8000), frontend `cd web-frontend && npm run dev` (port 3000). Sign in as **elena** (commander); the PINs are in the root `.env` (never show it on screen). The database is shared and slow (~10–15 s per update): cut the waits. Kwame has old test alerts, so consider Hiro instead. `backend/server.js` has a local, uncommitted fix (database client error handlers) that stops crashes; keep it.

## Build kit (`video/build/`)
- `vid.py`: stdlib synth (heartbeat, real-key typewriter, flatline, boom, drone), typed-text drawtext helpers, `render()` (mixes sound effects + voice with FX, loudnorm -15 LUFS).
- `clip_*.py`: one script per finished clip. Run from `build/`: `python clip_hook.py ../clips/00-hook.mp4`.
- `voices.py`: regenerates voice lines plus word timings (`vo/*.json`) for syncing.
- `vo/`: raw voice MP3s + word timings. `../voiceover/` has the same lines with FX applied.
- Needs: `pip install edge-tts imageio-ffmpeg playwright`. Chrome is installed (`channel="chrome"`). Fonts: `C:/Windows/Fonts/consola.ttf`, `seguisb.ttf`, `segoeuil.ttf`.

## Rules to keep
- Don't commit or push without showing the user first (only `VIDEO_PLAN.md` is pushed so far).
- Disclose the AI voiceover in the project description. Credit the typing sound, the NASA suit model and the datasets.
- The local T&C ask for a 2–3 minute video: the user should confirm with the organizers that a 1:30 hook is OK.

## Update 2026-11-14 (Motion Reel session): final cut built
`final/pearson-specter-hook.mp4`: 1:20.7, 1080p30, -14.2 LUFS / -1.1 dBFS peak. Hook + problem untouched; scenes 02-05 are one Motion Reel film (`reel/`, 30 fps, no blur).
- **02 VitaCuff**: `build/vc_capture2.py` renders each frame and reads it with `canvas.toDataURL` in the same call (no jitter). Own camera, cold rim lights, seeded starfield, NASA logo plates hidden, training arm stretched so its cut ends stay off frame. Typed HUD (VITACUFF, HEART RATE 72, SpO2 98%, 3/3 LOADED) with real keys.
- **03 emergency**: `build/dash_capture.py` (CDP screencast + marks) on **Hiro**: Simulate → Bradycardia → alert after 9 s (real) → pipeline → Care → Events. Old acknowledged alerts hidden via CSS during capture. The system actually **held** the atropine dose ("Unavailable, pending dose review"), so line 04 now says "The dose is checked first." (was "The injection is ready"). Kwame → Hiro too. Same voice and settings.
- **04 Mars**: one-way delay 750 s → Mission controls (Mars) → Earth link marked down (restored afterwards).
- **05 close + end card**: VitaCuff turning, "They carry the doctor with them." typed with the voice, PEARSON-SPECTER on the boom.
- Sound: `build/reel_audio.py` (typed-label plan, real keys, heartbeat motif: drags on the crash, steadies after, voices + FX, score for the whole video), Motion Reel `sfx.mjs` for whooshes/impacts from the film's HITS, `build/assemble.py` masters.
- Rebuild: `cd build && python reel_audio.py`, then from `video/`: `node <motion-reel>/scripts/render.mjs --film reel --fps 30 --noblur --video-only`, `node <motion-reel>/scripts/sfx.mjs reel`, `cd build && python assemble.py ../final/pearson-specter-hook.mp4`.
- Known soft spot: the screencast frames are 1280x720 upscaled; fine on a projector, slightly soft in the tightest zooms.
- Don't commit `reel/fonts/` (Microsoft fonts), `node_modules/`, `work/`, `out/`.

## Update 2 (same day)
- Keys only on the opening title; after it they are a whisper (problem 0.05, reel x0.12).
- Minimal ECG over the hook black screen (`ecg/` film, spikes on the beat times `clip_hook.py` writes to `work/hook_beats.json`). Render it, then `ffmpeg -i clips/00-hook.mp4 -i out/ecg/video_16x9.mp4 -filter_complex "[0:v][1:v]blend=all_mode=lighten,format=yuv420p[v]" -map "[v]" -map 0:a -c:a copy work/hook_ecg.mp4` before `assemble.py`.
- Booms under spoken words are pure subs now (no noise burst): the title hit cracked the voice at 0:32. Score ducks under the voice.

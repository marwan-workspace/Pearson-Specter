# The 3-minute video: script, shots and how to make it

**Rules (Amman & Aqaba T&C):** video **2 to 3 minutes**, max 7 slides, submit on the official Space Apps site by **3 PM, November 14**. Aim for **2:45** and submit by 2 PM.

**The one idea the video must land:** on the way to Mars, nobody can call a doctor, so the crew carries one on their wrist.

Everything in the video serves that line. If a shot doesn't, cut it.

---

## Part 0: Before you record

1. **The `.env` file** is in the main `Pearson-Specter` folder. Never show it on screen.
2. **Backend:** in `backend/`, run `npm start`.
3. **Front end:** in `web-frontend/`, run `npx next dev -p 3000 --webpack`. Plain `npm run dev` crashes the astronaut pages right now.
4. Open `localhost:3000`.

**Two logins:**
- **elena**: the commander. She sees the Crew overview, Mission controls, Simulate and Write weekly report.
- **kwame**: crew. Only he gets the **Agent** tab (daily check-in and private chat) on his own record.

**Before recording:**
- Ask the team to **stop using the dashboard**. It's one shared database, so their clicks show up in your shots.
- In **Mission controls**, set Location to **Mars** and make sure the Earth link is up, so the story starts from a clean state.
- **Everything is slow** (10 to 15 seconds per update, because the database is in Australia). Keep recording through the waits and cut them in editing.

---

## Part 1: The script

About 380 words of voiceover, about 2:45 at a calm pace. **Left column:** what's on screen. **Right column:** what you say.

### 0:00 to 0:15 · The hook

| On screen | You say |
|---|---|
| Black screen. White text appears: **"Mars. 20 minutes from the nearest doctor."** Hold 3 seconds. | *(silence, or one low music note)* |
| A slow pan across a NASA image of Mars or the ISS. | "On the way to Mars, a message to Earth takes up to twenty minutes. If an astronaut's heart stops, nobody on Earth can help in time." |

### 0:15 to 0:35 · The problem

| On screen | You say |
|---|---|
| Text, one line at a time: **"Radiation." "Bone loss." "No sleep." "Isolation."** | "And it's not only emergencies. Every day in space, radiation builds up, bones get weaker, sleep breaks down, and the stress keeps growing. Small problems quietly become big ones." |
| Cut to black, then the team name and project name. | "We're Pearson-Specter. This is our crew health system." |

### 0:35 to 1:00 · VitaCuff (the 3D wrist page)

| On screen | You say |
|---|---|
| VitaCuff page, top. Slowly drag to turn the model. | "It starts with VitaCuff, a medical unit that straps to the inside of the wrist." |
| Scroll to "It reads your body all day". | "It reads heart rate, blood oxygen, temperature and blood pressure, around the clock." |
| Scroll to the syringes section. | "It holds up to three prefilled syringes, right over the veins." |

### 1:00 to 1:20 · The crew, live

| On screen | You say |
|---|---|
| As **elena**: **Crew overview**. Four crew cards with live heart, oxygen, pressure, temperature. | "This is what the commander sees. Every crew member, live." |
| Click **Kwame Mensah** → **Telemetry** tab. The 3D suit and the heart trace. Drag the suit slowly. | "Open anyone, and you see their body in real time: every vital, every zone of the suit." |

### 1:20 to 1:55 · The emergency (the most important 35 seconds)

| On screen | You say |
|---|---|
| Click **Simulate** → **Bradycardia (tier 1)** → confirm. | "Now we simulate Kwame's heart rate dropping dangerously low." |
| The red alert banner appears. Zoom on it. Then the **Hybrid watch pipeline** panel. | "The watch catches it in seconds. First, fixed medical limits. Then a machine-learning model checks if he's just exercising. Only then does an AI pick the condition, from a rule book it can't overrule." |
| **Care** tab: the medication event with its cancel countdown. Then **Events** tab: crew alerts. | "For a life-threatening case, the unit prepares the injection, with a window to cancel. And the rest of the crew is told who's in trouble and exactly what to do." |

### 1:55 to 2:25 · Every day, and far from Earth

| On screen | You say |
|---|---|
| Click **Run assessment**. The button reads "Scanning biometrics…" then "Evaluating ML + Gemini rules…" while the suit is scanned. | "Every day, it runs a full assessment. It connects the dots, poor sleep, low mood, a rising heart rate, and finds the cause, not just the symptom." |
| As **kwame**: **Agent** tab → Daily check-in. Type one short answer and the agent replies. | "Each astronaut does a short, private check-in with the AI." |
| As **elena**: **Mission controls**. Show Location on Mars and the one-way delay, then mark the **Earth link down**. | "At Mars, Earth answers too late, or not at all. So the system, and the commander, decide on board." |
| **Needs your decision** → **Approve**. | "The commander approves the plan right here." |

### 2:25 to 2:35 · Reports

| On screen | You say |
|---|---|
| Click **Write weekly report** (top right). Show it in **Mission reports**. | "And every week, it writes a health report to Earth, queued until the link comes back." |

### 2:35 to 2:50 · The close

| On screen | You say |
|---|---|
| Back to the VitaCuff 3D model, slowly turning. | "Twenty minutes from help, the crew doesn't wait. They carry the doctor with them." |
| Black screen: **project name, team name, "NASA Space Apps Challenge"**. Hold 3 seconds. | *(music ends)* |

> **Honesty line:** add a small caption at 0:35 that says "Concept. Vitals are simulated." Judges respect it.

---

## Part 2: The shot list

Record each shot as its own clip and **do 2 or 3 takes of each**. Practice each click once off camera first.

| # | Shot | Login | Where | Notes |
|---|---|---|---|---|
| 1 | VitaCuff model turning | none | `localhost:3000/vitacuff/index.html` | 10 seconds of slow dragging. |
| 2 | VitaCuff vitals section | none | same, scroll | Scroll gently. |
| 3 | Syringes loading | none | same | Let the animation finish. |
| 4 | Crew overview | elena | `localhost:3000` | Wait until all four cards show numbers. Slow mouse pass over the cards. |
| 5 | Kwame's Telemetry tab | elena | click Kwame → Telemetry | Drag the 3D suit slowly. Let the heart trace run for 5 seconds. |
| 6 | Inject bradycardia | elena | Simulate → Bradycardia (tier 1) → confirm | Record from the click until the red banner appears. |
| 7 | Watch pipeline | elena | Telemetry tab, scroll to "Hybrid watch pipeline" | Zoom in the edit. |
| 8 | Cancel window and alerts | elena | **Care** tab, then **Events** tab | Get the countdown while it's still running. |
| 9 | Run assessment | elena | **Run assessment** button | Record the whole scan until "Saved". |
| 10 | Daily check-in | kwame | **Agent** tab → Daily check-in | Type something natural, like "Slept badly, about 5 hours." |
| 11 | Mars and link down | elena | Crew overview → Mission controls | Show the delay, then mark the link down. |
| 12 | Approve | elena | Needs your decision → Approve | |
| 13 | Weekly report | elena | Write weekly report → Mission reports | |
| 14 | Mars/space footage | none | images.nasa.gov | Credit at the end. |

**Bonus shot if you have time:** on the Telemetry tab, click a part of the 3D suit → **Simulate damage here**. It looks great and fits the "always watching" line.

**Watch out:**
- Kwame already has an old "sensor_fault" alert and two old decisions from teammates' testing. Ask a teammate to clear them before you record, or pick a crew member with a clean record (Hiro or Maya) and change the name in the script.
- Never show the sign-in screen while typing a PIN. Sign in before you hit record.
- Each bradycardia injection adds a new event. For a retake, use a different astronaut or ask a teammate to reset.

**Free footage:** images.nasa.gov. Search "Mars surface", "ISS interior", "Earth from orbit". Don't use NASA's logo in a way that suggests NASA made or endorses the video.

---

## Part 3: How to make it, step by step

Use **Clipchamp** (already on Windows 11). It records screen and voice, edits, adds music and captions, and exports.

### Step 1: Rehearse out loud (15 min)
Read the script twice with a stopwatch. If you're over 3:00, cut words, don't talk faster. Change anything that doesn't sound like you.

### Step 2: Record the voice FIRST (30 min)
- A small room full of soft stuff (a closet, or under a blanket).
- Your phone's voice recorder, about a hand-width from your mouth, slightly to the side.
- Speak slower than feels natural, and smile a bit.
- Record section by section. If you mess up, pause and restart *that sentence*.

### Step 3: Record the screen (45 min)
- **Do Not Disturb** on, chat apps closed, bookmarks bar hidden.
- Browser full screen (**F11**), 1920×1080 if you can.
- Sign in before recording.
- Move the mouse **slowly and on purpose**.
- **Win + Alt + R** to record, or Clipchamp → Record & create → Screen. One clip per shot.

### Step 4: Edit in Clipchamp (1 to 1.5 hours)
1. Voice first, in order. Cut mistakes and silences.
2. Lay each screen clip under its line. **Cut out every loading wait.**
3. **Zoom** on alerts, numbers and the pipeline so they're readable on a phone.
4. Title cards: big white text on black.
5. Music: calm ambient, around 10 to 15% volume, fade out at the end.
6. Captions → auto-generate, then fix the wrong words.
7. Plain cuts or quick fades only.

### Step 5: Feedback (15 min)
Show someone who knows nothing about it: "What does it do?" and "What was confusing or boring?"

### Step 6: Export and upload
1080p MP4. Watch it once through. Upload as **YouTube unlisted** (or Drive, "anyone with the link") and test the link in a private window.

---

## Mistakes that ruin hackathon videos
- A flat reading voice. *Tell* it.
- Showing every feature. The video is the story.
- Tiny text. Zoom in.
- Music louder than the voice.
- Going over 3:00.

## AI and credits (global rules)
- Mark any AI-generated images or video as AI-generated.
- Say in the project description that AI tools helped write the code.
- Credit NASA images, the suit model and the datasets at the end or in the description.

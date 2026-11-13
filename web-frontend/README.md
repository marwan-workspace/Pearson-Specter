# Crew Health: 3D astronaut dashboard (Next.js)

Frontend for the NASA Space Apps astronaut health-monitoring project. It covers **only the features in [`FEATURES.md`](../FEATURES.md)**, in a NASA-blue/red deep-space theme.

- **Crew overview (`/`)**: one interactive 3D astronaut per crew member, with the **top 4 features** (1 Sleep, 2 Mental health, 3 Vitals 24 h, 4 Treatment plan) and the medications each person takes.
- **Astronaut page (`/astronaut/[id]`)**: open it by clicking the 3D model or the name. It shows the rotatable 3D model (the chest beacon pulses at the live heart rate), live vitals, **24 h charts**, **medications**, and every other feature.

## Run it locally (Windows)

Requires **Node.js 20.9 or newer** (LTS recommended).

1. Get the code: it lives in this repo's `web-frontend/` folder. Clone the repo, or copy the folder to `D:\Nasa hackathon\3d model`.
2. Open PowerShell in that folder:

```powershell
cd "D:\Nasa hackathon\3d model"
```

(or `cd Pearson-Specter\web-frontend` inside a clone)

```powershell
npm install
```

```powershell
npm run dev
```

3. Open http://localhost:3000.

The app runs on port 3000, so it won't clash with whatever already runs on 5174. To use another port: `npx next dev -p 3001`.

## Demo script

1. **Overview**: four astronauts. Elena is nominal; Kwame (sleep and mental health), Hiro (BP) and Maya (radiation) are on Watch.
2. **Click Kwame's model**: charts, medication, sleep pattern, mental-health score, check-in, root cause and plan.
3. **Simulator (header)**: inject an emergency.
   - *Bradycardia* → tier 1: the watch auto-injects atropine after a 15 s **cancel window**. Stock and the med log update.
   - *Panic attack* → tier 2: guided breathing, then **confirm** or decline the dose.
   - *Tachycardia* → tier 3: a **crewmate alert** on every screen says who is in trouble and what to give.
   - *Loosen watch* → sensor fault, not a flatline emergency.
4. **Mars delay bar (under the header)**: at the ISS, a weekly report gets mission command's reply in about 30 s and the pending plan items are approved. Slide to **Mars** and the reply takes about 25 min, so the onboard system acts as the doctor.
5. **Earth link (header)**: toggle it off, then generate a weekly report and watch it **queue**. Toggle it on and it sends.
6. **Panic attack on Kwame**: besides the confirm-first prompt, **Ama's heartbeat** plays (feature 22). Demo audio is synthesised.
7. **Gravity drop test**: on any astronaut page, see how fragile their bones would be if they landed on Mars or Earth right now.
8. Exercise heart-rate spikes are logged as **suppressed false alarms** in the decision log, with the rule that fired.

Demo state (events, med log, stock, reports, chats) is saved in the browser. Use **Simulator → Reset demo data** to start over.

## Feature map

| # | Feature | Where |
|---|---|---|
| 1 | Sleep tracker (watch + check-in, cycles, suggested window) | Overview tile · Astronaut → Sleep |
| 2 | Mental health checks (set questions, score, therapy, sent to mission command) | Overview tile · Astronaut → Mental health |
| 3 | Short-term vitals evaluation (24 h, scored) | Overview tile · Astronaut → Vitals |
| 4 | Treatment plan (urgent proceeds; non-urgent waits for mission command) | Overview tile · Astronaut → Root cause & plan |
| 5 | Daily check-in (asks for yesterday if missed) | Astronaut → Check-in |
| 6 | Weekly check-in with mission command + emergency reports | Astronaut → Mission command |
| 7 | Vitals monitoring + on-the-spot medication (LLM applies a rule set, 3 tiers, activity context) | Global banners · Astronaut → Medication |
| 8 | Root-cause analysis | Astronaut → Root cause & plan |
| 9 | Manager agent (talk any time; astronaut report beats the watch) | Astronaut → Manager agent |
| 10 | Vitals simulator (inject emergency on cue) | Header → Simulator |
| 11 | Crewmate emergency alert | Global banner (tier 3) |
| 12 | Medication log, stock, dose limits, cancel window | Astronaut → Medication |
| 13 | Personal baselines | Baseline bands on every vitals chart |
| 14 | Radiation exposure tracker + take-shelter warning | Astronaut → Radiation · global banner |
| 15 | Blood test entry | Astronaut → Blood tests |
| 16 | Crew overview | `/` |
| 17 | Decision log (with the rule that fired) | Astronaut → Decision log |
| 18 | Works without Earth contact (reports queue) | Header → Earth link |
| 19 | Sensor fault detection | Simulator → Loosen watch |
| 20 | Mars delay bar (ISS → Moon → Mars; delays plan approval, reports and replies) | Slider under the header · Astronaut → Mission command, Root cause & plan |
| 21 | Gravity drop test (bone fragility if landing on Mars or Earth now) | Astronaut → Gravity drop test |
| 22 | Heartbeat in a bottle (family heartbeat on a stress spike) | Pops up automatically on a panic attack · Astronaut → Heartbeat from home |

## Code layout

```
src/
  app/page.tsx                 Crew overview (3D models + top 4 features)
  app/astronaut/[id]/page.tsx  Astronaut route
  components/AstronautView.tsx Full astronaut page (all sections)
  components/three/            Procedural 3D astronaut (three.js / react-three-fiber)
  components/charts.tsx        Recharts: vitals, BP, sleep, mental health, radiation
  lib/mission.tsx              Live state engine: watch stream, detection, response tiers, reports
  lib/conditions.ts            Condition → medication table, watch rule set, stock, Earth delays
  lib/sim.ts                   Vitals simulator
  lib/crew.ts                  Crew, sleep, mental health, check-ins, root cause, plans, labs
```

There is **no trained ML model** (per FEATURES.md). `detect()` in `lib/conditions.ts` applies the rule set deterministically and names the rule that fired; to use the real LLM, call it there with `RULES` and the recent vitals. For the real **manager agent**, replace `agentReply()` in `lib/mission.tsx`. To replay **datasets** in the simulator, replace `sampleAt()` in `lib/sim.ts`.

> **Placeholders:** the NHANES femur baseline and the bone-loss rate in feature 21, and the family recordings in feature 22, are placeholders because they are still open questions in FEATURES.md.
>
> **Medical warning (from FEATURES.md):** the condition → medication table has not been checked against NASA's medical kit or clinical guidelines and contains no doses. All crew members and data are fictional or simulated.

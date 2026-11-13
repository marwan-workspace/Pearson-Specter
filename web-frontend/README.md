# Crew Health: astronaut health dashboard (Next.js)

Frontend for the NASA Space Apps astronaut health-monitoring project. It covers **only the features in [`FEATURES.md`](../FEATURES.md)**.

- **Crew overview (`/`)**: the selected crew member's suit in orbit with live readings around it, next to a roster that compares all four on heart rate, 24 h vitals, sleep, mental health and treatment plan. It opens on whoever needs attention most.
- **Astronaut record (`/astronaut/[id]`)**: the suit you can turn by dragging, live vitals, 24 h charts and every other feature, grouped as Monitor, Care, Talk and Mission.

The 3D figure is NASA's own Extravehicular Mobility Unit model (public domain, from [nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources)). The ID stripes take each crew member's colour and the chest light beats at their live heart rate.

## Run it locally

Requires **Node.js 20.9 or newer**.

```bash
cd web-frontend
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. To use another port: `npx next dev -p 3001`.

## Connect the backend (Gemini)

The dashboard talks to the Python manager agent in this repo (`overview/agent.py`, which calls Gemini through `llm.py`). **The connection point is [`src/server/agent-bridge.ts`](src/server/agent-bridge.ts).**

```
browser ──► /api/agent/<command> ──► agent-bridge.ts ──► python -m overview <command> ──► Gemini
            (Next.js route)           (server only)       (or your own HTTP backend)
```

To turn it on, from the repo root:

1. `pip install -r requirements.txt`
2. Put `GEMINI_API_KEY=...` in the repo root's `.env` file (already git-ignored). Optionally `GEMINI_MODEL=...`.
3. Restart `npm run dev`. The **agent button in the header** turns to "Gemini live".

That header button opens the connection panel: it shows what is ready, what is missing and how to fix it, and can force the local simulation for a demo. The key never reaches the browser.

If you later put an HTTP server in front of the agent, set `AGENT_BACKEND_URL` (see [`.env.example`](.env.example)); no frontend code changes.

| Feature | Route | Called from | Python |
|---|---|---|---|
| 9 Manager agent chat | `POST /api/agent/chat` | Astronaut → Manager agent | `agent.chat` |
| 5, 2 Daily check-in and mental-health score | `POST /api/agent/checkin` | Astronaut → Daily check-in | `agent.checkin` |
| 8, 4 Root cause and treatment plan | `POST /api/agent/assess` | Astronaut → Root cause and plan → Run analysis | `agent.assess` |
| 6 Weekly report | `POST /api/agent/weekly` | Astronaut → Mission command → Write weekly report | `agent.weekly_report` |
| 6 Emergency report | `POST /api/agent/emergency` | available, not yet called (reports are built locally) | `agent.emergency_report` |
| Health check | `GET /api/agent/health` | header agent button | none |

When the backend is not ready, or a call fails, every one of these falls back to the local simulation, and each agent message is labelled "Gemini" or "Simulated". The watch's detection step (`detect()` in `lib/conditions.ts`) still runs locally; `watch/decide.py` has no command-line entry yet, so it is the next thing to wire in.

## Demo script

1. **Overview**: every crew member shows a different amber zone on the suit: Elena (lungs, low blood oxygen), Kwame (head, mental health), Hiro (blood pressure) and Maya (radiation). Select a row to put that crew member on the stage.
   - **Simulator → Start showcase** gives all four a different emergency at once, so each suit lights a different zone red: Elena heart, Kwame head (fever), Hiro blood pressure, Maya radiation. **Clear all** ends it.
2. **Open Kwame's record**: charts, medication, sleep, mental-health score, check-in, root cause and plan.
3. **Simulator (header)**: inject an emergency.
   - *Bradycardia* → tier 1: the watch injects atropine after a 15 s **cancel window**. Stock and the medication log update.
   - *Panic attack* → tier 2: guided breathing, then **confirm** or decline the dose. A family heartbeat plays (feature 22).
   - *Tachycardia* → tier 3: a **crewmate alert** on every screen says who is in trouble and what to give.
   - *Loosen watch* → a sensor fault, not a flat-line emergency.
4. **Ship location (under the header)**: at the ISS, a weekly report gets mission command's reply in about 30 s. Switch to **Mars** and it takes about 25 min, so the onboard system acts as the doctor.
5. **Earth link (header)**: switch it off, write a weekly report and watch it **queue**. Switch it on and it sends.
6. **Bone strength**: how fragile their bones would be if they landed on Mars or Earth today.
7. Exercise heart-rate spikes are logged as **suppressed false alarms** in the decision log, with the rule that fired.

Demo state is saved in the browser. Use **Simulator → Reset demo data** to start over.

## Feature map

| # | Feature | Where |
|---|---|---|
| 1 | Sleep tracker | Overview roster · Astronaut → Sleep |
| 2 | Mental health checks | Overview roster · Astronaut → Mental health |
| 3 | Short-term vitals evaluation (24 h, scored) | Overview roster · Astronaut → Vitals |
| 4 | Treatment plan | Overview roster · Astronaut → Root cause and plan |
| 5 | Daily check-in | Astronaut → Daily check-in |
| 6 | Weekly and emergency reports | Astronaut → Mission command |
| 7 | Vitals monitoring and on-the-spot medication | Banners on every screen · Astronaut → Medication |
| 8 | Root-cause analysis | Astronaut → Root cause and plan |
| 9 | Manager agent | Astronaut → Manager agent |
| 10 | Vitals simulator | Header → Simulator |
| 11 | Crewmate emergency alert | Banner on every screen (tier 3) |
| 12 | Medication log, stock, dose limits, cancel window | Astronaut → Medication |
| 13 | Personal baselines | Baseline band on every vitals chart · stage readouts |
| 14 | Radiation tracker and take-shelter warning | Astronaut → Radiation · banner |
| 15 | Blood test entry | Astronaut → Blood tests |
| 16 | Crew overview | `/` |
| 17 | Decision log | Astronaut → Decision log |
| 18 | Works without Earth contact | Header → Earth link |
| 19 | Sensor fault detection | Simulator → Loosen watch |
| 20 | Distance from Earth (ISS, Moon, Mars) | Strip under the header |
| 21 | Gravity drop test | Astronaut → Bone strength |
| 22 | Heartbeat in a bottle | Plays on a panic attack · Astronaut → Heartbeat from home |

## Code layout

```
public/models/emu.glb          NASA EMU suit model (Draco-compressed); decoder in public/draco/
src/
  app/page.tsx                 Crew overview
  app/astronaut/[id]/page.tsx  Astronaut route
  app/api/agent/               Routes the browser calls for the Gemini agent
  server/agent-bridge.ts       ← backend connection point (Python bridge or HTTP)
  app/globals.css              Design system: colour, type, motion tokens, reduced motion
  components/Stage.tsx         3D suit with live readouts
  components/three/            Scene, loading and no-WebGL fallback
  components/AstronautView.tsx Astronaut record (all sections)
  components/ConnectionPanel.tsx  Agent connection status
  lib/api.ts                   Typed, validated client for /api/agent
  lib/agent.ts                 Chat, check-in, analysis and report actions with simulation fallback
  lib/backend.tsx              Agent connection state
  lib/mission.tsx              Live state engine: watch stream, detection, response tiers, reports
  lib/conditions.ts            Condition → medication table, watch rule set, stock, Earth delays
  lib/sim.ts                   Vitals simulator
  lib/crew.ts                  Crew, sleep, mental health, check-ins, root cause, plans, labs
```

## Design notes

- **Colour**: deep orbital navy (`#091426` page, `#12233B` raised) taken from the VitaCuff walkthrough, warm white ink, cool silver secondary text, NASA blue `#0B3D91` for actions. Mint, amber and coral mean health status only, always with a word and its own symbol; crew identity colours (suit stripes, roster rings) are separate. Text is measured at 4.5:1 or better, essential readings at 7:1 or better.
- **Type**: one family, Archivo Variable, self-hosted. Its width axis carries the hierarchy: expanded for names and headlines, normal for reading, condensed for labels and units.
- **Motion**: transform and opacity only. With reduced motion on, the suit holds a still pose and interface movement is removed.
- **Performance**: one WebGL canvas per page, loaded after first paint, paused when off screen or the tab is hidden.
- The header mark is original. The NASA insignia is not used, since it needs NASA's permission.

> **Placeholders:** the NHANES femur baseline and the bone-loss rate in feature 21, and the family recordings in feature 22, are placeholders because they are still open questions in FEATURES.md.
>
> **Medical warning (from FEATURES.md):** the condition → medication table has not been checked against NASA's medical kit or clinical guidelines and contains no doses. All crew members and data are fictional or simulated.

## Interaction

- **Body zones on the suit**: heart, lungs, head, blood pressure and radiation glow on the 3D suit. A zone with a problem turns amber or red and throws its colour onto the suit; the heart beats at the live heart rate. Point at a zone or click it, or use the matching **body check** buttons under the suit (the same information, for keyboard and for browsers without WebGL). With nothing picked, the view follows the zone in most trouble. Logic lives in `src/lib/zones.ts`.
- **The suit leans toward the pointer** on the overview, and can be dragged on the record page.
- **Interface motion**: names rise into place, readings count up once when a crew member is chosen (live updates stay steady), the ship-location highlight slides, arrows lean on hover, a roster row flashes when its status changes, the cancel window drains as a bar, and record sections rise in as you scroll. All of it is switched off or reduced under reduced motion.

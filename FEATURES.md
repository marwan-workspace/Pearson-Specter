# Astronaut Health Monitoring: Features

NASA Space Apps hackathon project. Challenge: health vitals monitoring.

## The idea

Each astronaut wears a watch that reads vitals, checks them with a hybrid of machine learning and an LLM working from a rule set, catches problems early and gives life-saving medication on the spot. A dashboard on the ship, where astronauts check in daily, tracks sleep, mental health and watch data to find the underlying cause of emergencies. A manager agent coordinates the watch and dashboard data and reports to mission command on Earth.

## What we build for the hackathon

| Part | Built? | Notes |
|---|---|---|
| Dashboard | Yes | |
| Watch ML model, LLM and rule set | Yes | Code in `watch/`. ML detects, the LLM (Gemini) decides |
| Manager agent | Yes | Code in `overview/`. Gemini runs the daily check-in, root cause, treatment plan, chat and weekly report. Called as `python -m overview <command>` with JSON in and JSON out, shaped like the frontend's types |
| Physical watch | No | Vitals are simulated or replayed from datasets (feature 10) |
| Medication delivery hardware | No | "Administers meds" is a logged event shown on the dashboard |

## Priorities

- **Must**: needed for the hackathon demo.
- **Should**: build if time allows.
- **Later**: describe in the pitch, build after.

Priorities were assigned by the project manager pass and have not been reviewed by the team. Change them freely.

## Features

### Watch

#### 7. Vitals monitoring and on-the-spot medication — Must
The watch reads vitals, a hybrid of machine learning and an LLM checks them, and the watch responds to a detected problem.

- **ML detects:** a model trained on the wearable stress and exercise dataset labels each minute as rest, stress or exercise. Fixed checks flag abnormal readings (heart rate, blood pressure, radiation).
- **LLM decides:** Gemini gets the vitals, the activity label, the flags and the rule set, and picks the condition. This includes tier 1 automatic injections.
- **Rule set:** `watch/rules.json` holds each condition's flag, tier, first response and medication. The response for a chosen condition always comes from the rules, not from the LLM's text.
- **Safeguards:** the LLM cannot choose a condition whose flag is not raised. If the LLM is unreachable or its answer is rejected, the rules are applied directly, most severe first. The LLM cannot answer "none" while a tier 1 flag or a sensor fault is raised. A second automatic injection for the same condition is blocked for 30 minutes (unverified value) and becomes a crewmate alert. A missing or invalid sensor value raises a sensor fault instead of reading as healthy. The cancel window and stock tracking (feature 12) are not built yet.

- **Vitals read:** heart rate, blood pressure, radiation dose, sleep, blood oxygen, body temperature.
- **Conditions detected:** tachycardia, bradycardia, radiation sickness, panic attack, low blood pressure, high blood pressure. Low blood oxygen (below 90%) is also detected and alerts a crewmate. Fever is not checked yet.
- **Response tiers:**
  1. **Automatic injection** for immediately life-threatening cases: bradycardia, shock.
  2. **Confirm first** for everything else the watch can inject, including sedation for a panic attack. The astronaut confirms before the dose.
  3. **Crewmate gives it** for drugs a watch cannot inject (IV or oral). The watch alerts and tells a crewmate what to give (feature 11).
- **False alarms:** the rule set uses activity context (exercise raises heart rate to tachycardia levels). Every injection has a cancel window and dose limits (feature 12).

Medication per condition (starting point, see warning below):

| Condition | First response | Medication | Watch can inject? | Tier |
|---|---|---|---|---|
| Bradycardia (symptomatic) | Alert crew | Atropine; epinephrine if atropine fails | Yes | 1 |
| Shock (severe low blood pressure) | Lie down, alert crew | Epinephrine | Yes | 1 |
| Radiation sickness | Move to shielded area | Ondansetron (nausea); filgrastim (bone marrow) | Yes | 3 until a medical dose limit exists |
| Panic attack | Guided breathing on the watch | Lorazepam or midazolam | Yes, but sedating | 2 |
| Tachycardia (abnormal rhythm) | Breathing / vagal manoeuvres | Adenosine; metoprolol | No (IV) | 3 |
| Low blood pressure (not shock) | Lie down, fluids | Midodrine (oral) | No | 3 |
| High blood pressure (emergency) | Rest, recheck | Labetalol or nicardipine (IV); captopril (oral) | No | 3 |

> **Warning:** this table comes from general medical knowledge. It has not been checked against NASA's medical kit or current clinical guidelines, and contains no doses. A medical reviewer must check it before it is presented as fact.

#### 13. Personal baselines — Should
The rules compare each astronaut to their own normal values instead of Earth population averages, to cut false alarms.

#### 19. Sensor fault detection — Later
Tells a loose or removed watch apart from a real flatline.

### Dashboard

#### 5. Daily check-in per astronaut — Must
- The astronaut talks to the agent.
- Takes about 3 minutes, longer if needed.
- If a day is missed, the agent asks for yesterday's data at the next check-in.
- The check-in feeds sleep (1), mental health (2) and root-cause analysis (8).

#### 1. Sleep tracker — Must
- Data comes from both the watch (overnight) and the astronaut's check-in.
- Shows sleep patterns, number of sleep cycles, and suggested sleep windows.

#### 2. Mental health checks — Must
- The agent asks set questions and produces a score.
- Results go to mission command.
- If an issue is spotted, the agent recommends daily sessions that work as therapy.

#### 3. Short-term vitals evaluation — Must
Shows and scores the last 24 hours of watch data.

#### 8. Root-cause analysis — Must
- Runs every day as part of the check-in.
- Combines check-in answers, sleep, mental health and the 24-hour vitals to identify the underlying problem behind an emergency or symptom.

#### 4. Treatment plan — Must
- A plan for the underlying problem found by feature 8.
- Can contain medication, sleep schedule changes, therapy sessions, exercise and diet.
- **Urgent:** proceeds with no approval.
- **Not urgent:** checked with mission command first.

#### 14. Radiation exposure tracker — Should
Running total dose per astronaut with a take-shelter warning.

#### 16. Crew overview screen — Should
Every astronaut's status at a glance for the commander or medical officer.

#### 15. Blood test entry — Later
Periodic lab results (blood count, metabolic panel) entered on the dashboard. These are lab draws, not something the watch reads.

#### 20. Mars delay bar — Should
- A slider at the top of the dashboard: ISS → Moon → Mars.
- The further out, the longer Earth takes to answer. At Mars the system acts as the doctor.
- Affects everything that waits on Earth: non-urgent treatment plan approval (4), weekly and emergency reports (6), and replies from mission command.
- This is the story that ties the features together in the demo.

#### 21. Gravity drop test — Should
- Answers: "If this astronaut landed on Mars or Earth right now, how fragile are their bones?"
- Uses the NHANES femur bone scans as the baseline and published spaceflight bone-loss rates to estimate current bone density from time in space.
- Calculated from rules.

#### 22. Heartbeat in a bottle — Should
- An astronaut cannot call home live from Mars, so when their stress spikes the system plays a recorded heartbeat from their family.
- Triggered by the watch's stress detection.
- The emotional moment in the demo video.

### Manager agent

#### 9. Manager agent — Must
- Coordinates data from the watch and the dashboard.
- Astronauts can talk to it at any time, not only in the daily check-in.
- When the watch and the astronaut disagree (watch says healthy, astronaut feels ill), it analyses the data to find the reason for the feeling. The astronaut's report takes priority.

#### 6. Weekly check-in with mission command — Must
- Weekly report holds a written summary per astronaut, the raw data, and flagged issues.
- Mission command can reply (approve plans, change instructions). The dashboard presents the reply to the crew.
- An emergency triggers an immediate emergency report outside the weekly schedule.

#### 11. Crewmate emergency alert — Should
When the watch detects a problem, other astronauts are told who is in trouble and what to give. Required for response tier 3.

#### 12. Medication log and stock — Should
Records every dose, enforces dose limits and the cancel window, and tracks what is left on board.

#### 17. Decision log — Later
Every watch and agent decision is stored with the rule that fired and the reason, and included in the weekly report.

#### 18. Works without Earth contact — Later
Nothing depends on a live link to Earth. Reports queue up until contact returns.

### Demo support

#### 10. Vitals simulator — Must
Replays the datasets as a live watch stream and can inject an emergency on cue. Needed because there is no physical watch.

## Data

All under `raw/raw/`.

| Folder | Contents | Use | Limit |
|---|---|---|---|
| `astronaut_blood_inspiration4` | Blood count, metabolic panel, immune and cardiovascular markers | Blood test entry (15) | 28 samples from 4 crew |
| `earth_heart_bp` | 66 records of walk, sit, run with blood pressure, heart rate, blood oxygen | Activity context | Start and end values only; waveforms not in the folder |
| `nhanes` | 2005–2008 blood pressure, cholesterol, glucose, body measures, femur bone scans, medical history, mortality | Long-term risk, gravity drop test (21) | One-off measurements, not live streams |
| `radiation` | Dose-rate time series for ISS, Mars, Moon | Radiation tracker (14), simulator (10) | No health outcome attached |
| `sleep` | 5 sleep-stage recordings and a subject sheet | Sleep tracker (1) | Stages only, very small |
| `wearable_stress_exercise` | Wristband heart rate, skin temperature, skin conductance, motion during stress and exercise | Panic detection, false-alarm handling | No blood oxygen |
| `bidmc_spo2` | Heart rate, breathing rate, blood oxygen once per second, 53 hospital patients | Blood oxygen, abnormal heart rates | Hospital patients, 8 minutes each |

The last two are from PhysioNet under the Open Data Commons Attribution License v1.0, which requires crediting the source:
- https://physionet.org/content/wearable-device-dataset/1.0.1/
- https://physionet.org/content/bidmc/1.0.0/

## Open questions

- **LLM without Earth contact:** Gemini is a cloud API, so it conflicts with feature 18. The rules-only fallback covers the gap for now.
- **Activity model accuracy:** stress tasks are now labelled from the dataset's stage tags, but the model is still weak: it finds 76% of exercise minutes, 57% of rest minutes and 43% of stress minutes on people it has not seen. There are only 220 stress minutes to learn from, which limits panic attack detection.
- **Thresholds:** the high heart rate and radiation limits come from the data; low heart rate and blood pressure limits are fixed clinical values. All need medical review.
- **Bone-loss rates:** the published rates for feature 21 have not been chosen or sourced.
- **Family recordings:** where the heartbeat recordings for feature 22 come from for the demo.
- **Radiation sickness detection:** no dataset links dose to symptoms. Needs dose-threshold rules or simulated cases.
- **Mental health questions:** which set of questions and scoring to use is not decided.
- **"Urgent":** what makes a treatment plan urgent is not defined.
- **Medication doses:** none specified; needs medical review.
- **Tech stack:** not decided.
- **Repo hygiene:** the data is nested as `raw/raw`, contains leftover `Zone.Identifier` files, and is about 500 MB. Decide whether data is committed or ignored.

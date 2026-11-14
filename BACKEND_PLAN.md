# Backend and access plan

Status: JavaScript API, PostgreSQL schema, Python worker bridge, and dashboard integration are implemented. Database application and runtime setup remain environment steps.

## What changes

1. **The team leader sees the whole dashboard**: every astronaut's vitals, issues, plans and reports.
2. **No medical officer on board.** Every decision that needs a human is made by the team leader.
3. **Chain of command.** If the team leader has a problem, the position moves to the next person down the chain.
4. **Private by default.** Every other crew member sees only their own data.
5. **A real backend** replaces the dashboard's in-browser fake data, following `FEATURES.md`.

## Where the repo stands today

| Part | State |
|---|---|
| `database/schema.sql` | PostgreSQL schema includes accounts, sessions, command rank, chain-of-command functions, report timing, medication inventory, and RLS. |
| `watch/`, `overview/`, `llm.py` | Existing Python watch and manager-agent modules run as workers called by the JavaScript service. |
| `backend/` | Node.js HTTP API persists web and worker results with `pg`. |
| `web-frontend/` | Session-gated dashboard uses `/backend/*` for private records, crew overview, decisions, alerts, reports, lab entry, and command controls. |

One `rewrites` entry in `web-frontend/next.config.ts` forwards `/backend/*` to port 8000; cookies pass through. The legacy unauthenticated `/api/agent/*` route was removed; agent calls go through the backend's signed-in `/backend/*` endpoints.

## Access model

Three kinds of viewer. "Decider" is defined in the next section.

| Data | The astronaut it belongs to | The decider for that astronaut | Other crew |
|---|---|---|---|
| Vitals, sleep, check-ins, mental health | Yes | Yes | No |
| Free chat with the agent: the messages | Yes | No | No |
| Free chat with the agent: scores and summary | Yes | Yes | No |
| Root cause, treatment plan, medication log, blood tests | Yes | Yes | No |
| Watch events and decision log | Yes | Yes | No |
| Crewmate alert (who is in trouble, what to give) | Yes | Yes | Only the alert addressed to them |
| Weekly report (whole crew), mission command replies | No | Acting leader only | No |
| Emergency report | Yes | Yes | No |
| Crew overview screen (feature 16) | No | Acting leader only | No |
| Medication stock, rule set, mission info | Yes | Yes | Yes (read only) |

The crewmate alert is the one deliberate leak: feature 11 needs other astronauts to know who needs help. They get the alert text only, never the vitals behind it.

## Chain of command

- Every astronaut gets a `command_rank` (1 = team leader, 2 = next, and so on) and a `fit_for_command` flag.
- **Acting leader** = the fit, active astronaut with the lowest rank.
- **Decider for astronaut X** = the first fit, active person in the chain who is not X. For everyone except the acting leader that is the acting leader. For the acting leader it is the next person down, so the leader never approves their own treatment and someone can see the leader's data.

**Proposed** triggers for moving command down:

| Trigger | Effect |
|---|---|
| A tier 1 injection is actually given to the leader (the cancel window ran out) | Leader marked unfit. Command moves down. A tier 1 event the leader cancels changes nothing. |
| The leader hands over by choice | Command moves down. |
| A decision waits too long (emergency help: 60 s; plan approval: 12 h) | Only that one decision moves to the next in chain. The leader stays leader. |
| The leader's event is resolved | Command does **not** return by itself. The acting leader restores it. |

Every change is written to a hand-over log with who, when and why, and goes into the next report to mission command.

**Each decision is made once.** When a time-out hands a decision to the next person, the first person can still answer. Both answers go through one statement that only succeeds while the item is still waiting:

```sql
UPDATE decisions SET outcome = $1, decided_by_astronaut_id = $2
 WHERE id = $3 AND outcome = 'proposed' RETURNING id;
```

The second person gets no row back and is told it was already decided.

## Who decides what

| Decision | Today | Planned |
|---|---|---|
| Cancel a tier 1 automatic injection | The astronaut | The astronaut (unchanged) |
| Confirm a tier 2 dose | The astronaut | The astronaut; if no answer in 60 s, their decider |
| Tier 3: first response (oxygen, lie down, breathing) | Any crewmate | Any alerted crewmate, at once. Never waits for approval |
| Tier 3: give an oral or IV drug | Any crewmate | Decider approves. After one 60 s time-out any alerted crewmate may give it |
| Non-urgent treatment plan items | Mission command | **Decided:** decider approves; mission command is informed weekly and may advise |
| Medication items written by the LLM | Mission command | Decider |
| Dose past the daily limit (today it is just blocked) | Nobody | Decider is asked |
| Enter blood test results | Medical officer | The astronaut or their decider |
| Mental health results | Sent to mission command | Decider and mission command |

## Database changes

`schema.sql` has never been applied anywhere, so these changes are made in `schema.sql` itself. There is no second migration file to keep in step.

**Roles and chain**
- `astronauts.role`: drop `medical_officer`. Keep `role` as a display title only; authority comes from rank.
- Add `astronauts.command_rank INTEGER NOT NULL`, unique per mission, and `astronauts.fit_for_command BOOLEAN NOT NULL DEFAULT TRUE`.
- New `command_handovers` (mission, from, to, reason, trigger, created_at).
- `treatment_plans.created_by`: drop `medical_officer`, add `team_leader`.

**Who approved**
- `treatment_plans.approved_by` (free text) becomes `approved_by_astronaut_id` (foreign key).
- `medication_events`: add `confirmed_by_astronaut_id`, `administered_by_astronaut_id`.
- `decisions`: add `decided_by_astronaut_id` and `escalated_from_astronaut_id`.

**Logins**
- New `accounts` (astronaut_id, login, pin_hash, failed_attempts, locked) and `sessions` (token_hash, astronaut_id, expires_at).

**Access rules, enforced by the database**
- Two SQL functions: `acting_leader(mission_id)` and `decider_for(astronaut_id)`. Both are declared `SECURITY DEFINER` (they run with the table owner's rights) and `STABLE`. Without that, a rule on `astronauts` that calls a function reading `astronauts` stops with an infinite-recursion error, and the function could not see the other crew members it has to rank.
- `astronauts` itself: every crew member may read each crewmate's name, callsign, rank and fitness, because the chain of command is not private. Nothing else about a crewmate is in that table.
- A third function, `visible_astronauts()`, returns the ids the current user may see: themselves plus everyone they are decider for. Also `SECURITY DEFINER` and `STABLE`.
- Row-level security on every per-astronaut table. One rule, reused:

```sql
-- the backend sets app.astronaut_id at the start of every request's transaction
CREATE POLICY own_or_decider ON vital_samples
  USING (astronaut_id IN (SELECT visible_astronauts()));
```

  The list is worked out once per query, not once per row: a 24-hour vitals chart is about 43,000 rows.

- Applies to: `vital_samples`, `sleep_sessions`, `check_ins`, `agent_conversations`, `health_assessments`, `condition_events`, `decisions`, `medication_events`, `treatment_plans`, `lab_results`. Child tables (`sleep_stages`, `check_in_answers`, `treatment_plan_items`) follow their parent.
- `agent_messages` is the exception: **owner only**. The decider never reads free-chat messages. `agent_conversations` gets a new `summary` column (written by the agent when the chat closes) that the decider may read, which is how decision 5 is kept.
- `crew_alerts`: visible to the recipient, the subject and the subject's decider.
- `mission_reports`: weekly rows to the acting leader only; emergency rows by the rule above.
- Two database roles, never mixed:
  - `app_user`: used for every web request. It does not own the tables, so the per-row rules always apply. Each table also gets a write rule (`WITH CHECK`) saying what this role may insert or change: an astronaut writes only their own check-ins, chats and lab results; a decider writes approvals.
  - `watch_service`: used only by the watch loop inside the server, never by a web request. It skips the per-row rules (`BYPASSRLS`), because the loop must read past doses and command fitness and write events, alerts and reports for every astronaut.

**Fixes carried in the same change** (from the audit)
- `vital_samples.activity`: allow `stress` (the watch model outputs it; today the insert would fail).
- `vital_samples.radiation_rate_unit`: make it required and fix one unit (µSv/h).
- Seed data: the four demo astronauts with ranks, plus the medications in `watch/rules.json`.

## Backend

**Stack:** one JavaScript service (`backend/server.js`, Node.js and `pg`) on port 8000. The dashboard reaches it through the `/backend/*` rewrite. It calls the existing `overview` and `watch` Python modules as workers so their validated behavior remains shared. Install backend dependencies with `npm install` in `backend/`; install Python dependencies from `requirements.txt`.

**Login:** login name plus PIN per astronaut. Five wrong PINs in a row lock the account until the acting leader unlocks it (the leader's own account is unlocked by their decider); a correct PIN resets the count. The server keeps sessions in the database and sets a cookie. The `/backend/*` rewrite passes that cookie through, so the browser still talks only to the dashboard.

**Every request:** check session, open a transaction, set `app.astronaut_id`, run queries. Any astronaut id in a request body (the agent commands carry `astronautId`) must match the session's astronaut or someone they are decider for, or the request is refused with 403. The database decides what comes back. The service adds its own check on top for leader-only screens.

**Endpoints**

| Area | Endpoints | Who |
|---|---|---|
| Login | `POST /auth/login`, `POST /auth/logout`, `GET /me` (who am I, am I acting leader, whose decider am I) | Anyone |
| My data | `GET /astronauts/{id}/vitals`, `/sleep`, `/mental`, `/checkins`, `/assessment`, `/plan`, `/medications`, `/labs`, `/events`, `/decisions`. Each takes `?since=<time>` and returns only newer rows | Self or decider |
| Crew overview | `GET /crew/overview` | Acting leader |
| Decisions | `GET /decisions/pending`, `POST /decisions/{id}` (approve or reject) | Decider |
| Watch events | `POST /events/{id}/cancel`, `/confirm` (self); `/given` (alerted crewmate) | See table above |
| Alerts | `GET /alerts`, `POST /alerts/{id}/ack` | Recipient |
| Command | `GET /command` (chain, acting leader, log), `POST /command/handover`, `/command/restore`, `/command/earth-link`, `/command/location`, `POST /accounts/{id}/unlock` | Crew read; leader acts |
| Agent | `GET /health`, `POST /checkin`, `/chat`, `/assess`, `/weekly`, `/emergency` (same JSON as today; the server now loads the data itself and stores the result) | Self, or decider for `/assess`; `astronautId` is checked against the session; weekly is leader only |
| Reports | `GET /reports`, `GET /reports/{id}` | By the access table; link loss queues reports, location sets round-trip timing, and the demo worker records simulated acknowledgments |
| Demo | `POST /simulator/inject`, `POST /simulator/sensor-fault` | Acting leader |

**Watch loop:** one background task. Each tick, for each astronaut: take a simulated reading, store it, run `watch.detect` and `watch.decide`, and store the outcome (event, decision, medication event with its cancel deadline, crewmate alerts, emergency report). The last-dose lockout is read from `medication_events`, which fixes the audit finding that it was lost between processes. The same loop checks whether the leader is still fit and whether any decision has timed out.

**Features to backend**

| Feature | Backend piece |
|---|---|
| 1 Sleep, 3 Vitals 24 h, 14 Radiation, 15 Blood tests | Read endpoints over stored rows |
| 2 Mental health, 5 Daily check-in | `POST /checkin` stores messages, answers and score |
| 8 Root cause, 4 Treatment plan | `POST /assess` after a completed check-in; plan items wait in the decider's queue |
| 7 Watch, 10 Simulator, 19 Sensor fault | Watch loop |
| 11 Crewmate alert | `crew_alerts` rows and `/alerts` |
| 12 Medication log and stock | `medication_events`, `medication_inventory`; stock starts empty, and administration requires reviewed quantity plus matching inventory |
| 6 Weekly and emergency reports, 18 Offline, 20 Mars delay | `mission_reports` queue with send and reply times |
| 9 Manager agent chat | `POST /chat` with context loaded by the server |
| 16 Crew overview | `GET /crew/overview`, acting leader only |
| 17 Decision log | `decisions` table, now with who decided |
| 13, 21, 22 | No backend change (rules, calculation, audio) |

## Changes outside the backend

- **Dashboard:** add a login screen. Crew land on their own page; only the acting leader gets the crew overview and a pending-decisions panel. Replace the in-browser state in `lib/mission.tsx` with calls to the backend: load 24 h once, then poll every 2 s with `?since=` the last row's time, so each poll fetches only new rows. Remove "Medical Officer" (Maya's role, blood test `enteredBy`).
- **Approval value:** `pending-mission-command` becomes `pending-team-leader` in one commit across all nine files that use it: `overview/agent.py`, `overview/examples/week.json`, `tests/test_overview.py`, and in `web-frontend/src`: `lib/types.ts`, `lib/crew.ts`, `lib/mission.tsx`, `lib/agent.ts`, `lib/api.ts`, `components/AstronautView.tsx`. Changing one side only makes the dashboard's "awaiting approval" counts match nothing. Agent prompts say "team leader" where they say mission command approves.
- **`FEATURES.md`:** update features 2, 4, 6 and 16, and add a feature for chain of command and access.
- **`uml/`:** regenerate after the schema change.

## Build order

| Step | What | Done when |
|---|---|---|
| 0 | Team answers the open questions | Done, see Decisions |
| 0b | Create the Supabase project, put `DATABASE_URL` in `.env` | The service can connect |
| 1 | Schema changes and seed data | SQL tests: crew cannot read another's rows; the leader can; with the leader unfit, rank 2 can; the leader cannot read another's chat messages but can read the summary; reading `astronauts` raises no recursion error |
| 2 | Service skeleton: login, `/me`, read endpoints | API tests repeat the checks above over HTTP; the sixth wrong PIN is refused even when correct |
| 3 | Chain of command: decider, hand-over, pending decisions, time-outs | Tests: a tier 1 injection given to the leader moves command and writes a log row; a cancelled one does not; leader and deputy deciding the same item at once leaves exactly one result |
| 4 | Agent endpoints store their results | A check-in ends in a stored plan waiting for the decider |
| 5 | Watch loop writes to the database | Injected bradycardia produces event, dose, alert and report rows; low oxygen alerts crewmates with no approval step |
| 6 | Dashboard: login, guards, leader queue, live data | Two browsers logged in as crew and leader see different screens |
| 7 | `FEATURES.md`, UML, READMEs | Docs match the code |

**Smallest demo that shows the new rules:** steps 1 to 3, plus the login and guards from step 6. The rest of the dashboard can stay on simulated data until steps 4 and 5 land.

## Decisions

All eight questions are answered. Items 2 to 6 and 8 were proposed by the planner and accepted by the team.

1. **Plan approval:** the leader (or the decider) approves on board. Mission command is informed weekly and can advise. `FEATURES.md` features 4 and 6 need updating to match.
2. **Tier 3 drugs:** the leader approves before a crewmate gives the drug. After one 60 s time-out with no answer, any alerted crewmate may give it; the wait is not repeated down the chain. First responses (oxygen, lie down, breathing) never wait for approval. *Changed after review: the original wording made oxygen wait for approval.*
3. **A problem with the team leader** means a tier 1 injection actually given to the leader, or a voluntary hand-over. *Changed after review: a cancelled false alarm no longer moves command.* A low mental health score or a missed check-in does not move command.
4. **Giving command back:** the acting leader restores it. It never returns automatically.
5. **Private conversations:** the leader reads check-in transcripts. For free chat with the agent the leader sees scores and a summary only.
6. **Chain order for the demo crew:** Elena (leader), Kwame, Hiro, Maya.
7. **PostgreSQL runs on a hosted Supabase project.** See the notes below.
8. **Time-outs:** 60 s for emergency decisions, 12 h for plan approval. Both are demo values.

### Supabase notes

- The Python service connects with the project's Postgres connection string, kept in the git-ignored `.env` as `DATABASE_URL`. Through Supabase's pooler, `app.astronaut_id` must be set with `set_config(..., true)` inside each request's transaction.
- Row-level security is switched on for **every** table, including shared ones like `medications`. Supabase publishes an automatic web API over the database; with security on and no rule for its public key, that API returns nothing.
- Login stays in our own `accounts` and `sessions` tables. Supabase's built-in login is not used: it would move the access rules onto a second identity system for no gain in a four-person demo.
- Migrations are applied through Supabase (dashboard SQL editor or CLI), not by the service at start-up.
- The demo now needs an internet connection to reach the database. For feature 18 (works without Earth contact) the pitch should say the on-board database is hosted only for the hackathon.

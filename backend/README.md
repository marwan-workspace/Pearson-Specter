# JavaScript backend

Node.js HTTP API backed by PostgreSQL (`pg`). It listens on port 8000 and is reached by the dashboard through the same-origin `/backend/*` rewrite. It uses `app_user` for authenticated web transactions and `watch_service` for the bounded job runner and watch/deadline loop.

## Start

Apply [`../database/schema.sql`](../database/schema.sql) and seed crew PINs first. Put `DATABASE_URL`, `GEMINI_API_KEY`, and the four `DEMO_PIN_*` values in the ignored repository-root `.env` file. Then run:

```sh
npm install
npm run db:migrate
npm run seed:accounts
npm start
```

`npm test` runs the database tests against an empty throwaway database named by `DATABASE_URL_TEST` (it applies the schema and migrations itself). Without that variable, database tests are skipped locally; CI or `REQUIRE_DB_TESTS=1` makes the missing database a failure. Validation tests always run. The GitHub Actions workflow supplies an isolated PostgreSQL service and also checks Python tests and the frontend build.

Python workers use the repository virtual environment by default. Set `PYTHON_BIN` if the Python executable is elsewhere. Set `WATCH_ENABLED=false` to disable the watch loop or `WATCH_TICK_MS` to change its interval.

On Windows, if `.venv` was created under Linux/WSL, create a separate environment with `py -m venv .venv-windows`, then run `.venv-windows\Scripts\python.exe -m pip install -r requirements.txt` from the repository root. The backend detects this environment automatically.

## API surface

- `POST /backend/auth/login`, `POST /backend/auth/logout`, `GET /backend/me`
- `GET /backend/astronauts/:id/{vitals,sleep,mental,checkins,assessment,plan,medications,labs,events,decisions}`
- `GET /backend/astronauts/:id/record?<stream>=<time>` returns all ten streams above in one query, each newer than its own optional cursor (for example `?vitals=2026-11-14T09:00:00Z`); the dashboard's record page polls this instead of the ten routes
- `GET /backend/dashboard` combines crew, pending decisions, report summaries and command data in one authorized snapshot.
- `GET /backend/astronauts/:id/related?chat=true` combines scoped alerts, stock, decisions and roster; chat is returned only to its owner.
- Record requests accept `streams=vitals,events` to load just the selected tab, `activeEvents=true` for current episodes, and `before_<stream>=<cursor>` from `_pages` for older history. Mutable streams use `updated_at` cursors; vitals use `observed_at`. Large raw watch payloads are excluded. `_activeEvents` is independent of history paging.
- `POST /backend/jobs` accepts `{command,input,requestId}` and returns 202 with a job ID. `GET /backend/jobs/:id` returns only the caller's job status/result. At most two workers run globally, the queue holds at most 32 active jobs, and a user can have at most two. Equivalent in-flight requests coalesce, request IDs are idempotent, and results expire after one day. Queued jobs survive restart; interrupted running jobs fail after three minutes and should be reviewed before retrying. Legacy agent endpoints wait on the same bounded queue.
- `POST /backend/condition-events/:id/resolve` accepts `{confirmed:true}` for explicit review of simulator or manually reported events. Watch episodes close only when a valid reading clears their flag. Closure resolves linked alerts and cancels unadministered pending actions, preserving administered-dose history.
- `GET /backend/crew/overview`, `GET /backend/decisions/pending`, `POST /backend/decisions/:id`
- `POST /backend/events/:id/{cancel,confirm,given}`, `GET /backend/alerts`, `POST /backend/alerts/:id/ack`
- `GET /backend/command`, `POST /backend/command/{handover,restore,earth-link,location}`, `POST /backend/accounts/:id/unlock`
- `POST /backend/{checkin,chat,assess,weekly,emergency}`, `GET /backend/reports`, `GET /backend/reports/:id`
- `POST /backend/labs`, `GET /backend/{medications,rules}`, `POST /backend/simulator/{inject,sensor-fault}`
- `GET /backend/health`

Every astronaut path and `astronautId` body field is resolved against the session and checked by the service; RLS independently filters database rows. Decision outcomes use a conditional `UPDATE ... WHERE outcome='proposed'`, so only the first responder succeeds.

Earth reports queue while the acting leader has marked the link unavailable. Restoring it schedules delivery from the mission's round-trip time; the worker adds the configured review interval and stores a simulated mission-command acknowledgment. Weekly reports remain advisory: Earth replies do not approve treatment plans. Medication inventory is intentionally empty. A dose cannot be approved or recorded as administered without a medically reviewed quantity, matching stock unit, and available inventory.

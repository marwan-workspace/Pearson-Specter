# JavaScript backend

Node.js HTTP API backed by PostgreSQL (`pg`). It listens on port 8000 and is reached by the dashboard through the same-origin `/backend/*` rewrite. It uses `app_user` for authenticated web transactions and `watch_service` only for the in-process watch/deadline loop.

## Start

Apply [`../database/schema.sql`](../database/schema.sql) and seed crew PINs first. Put `DATABASE_URL`, `GEMINI_API_KEY`, and the four `DEMO_PIN_*` values in the ignored repository-root `.env` file. Then run:

```sh
npm install
npm run seed:accounts
npm start
```

`npm test` runs `smoke.test.js` against an empty throwaway database named by `DATABASE_URL_TEST` (it applies the schema itself); without that variable the tests are skipped.

Python workers use the repository virtual environment by default. Set `PYTHON_BIN` if the Python executable is elsewhere. Set `WATCH_ENABLED=false` to disable the watch loop or `WATCH_TICK_MS` to change its interval.

## API surface

- `POST /backend/auth/login`, `POST /backend/auth/logout`, `GET /backend/me`
- `GET /backend/astronauts/:id/{vitals,sleep,mental,checkins,assessment,plan,medications,labs,events,decisions}`
- `GET /backend/crew/overview`, `GET /backend/decisions/pending`, `POST /backend/decisions/:id`
- `POST /backend/events/:id/{cancel,confirm,given}`, `GET /backend/alerts`, `POST /backend/alerts/:id/ack`
- `GET /backend/command`, `POST /backend/command/{handover,restore,earth-link,location}`, `POST /backend/accounts/:id/unlock`
- `POST /backend/{checkin,chat,assess,weekly,emergency}`, `GET /backend/reports`, `GET /backend/reports/:id`
- `POST /backend/labs`, `GET /backend/{medications,rules}`, `POST /backend/simulator/{inject,sensor-fault}`
- `GET /backend/health`

Every astronaut path and `astronautId` body field is resolved against the session and checked by the service; RLS independently filters database rows. Decision outcomes use a conditional `UPDATE ... WHERE outcome='proposed'`, so only the first responder succeeds.

Earth reports queue while the acting leader has marked the link unavailable. Restoring it schedules delivery from the mission's round-trip time; the worker adds the configured review interval and stores a simulated mission-command acknowledgment. Weekly reports remain advisory: Earth replies do not approve treatment plans. Medication inventory is intentionally empty. A dose cannot be approved or recorded as administered without a medically reviewed quantity, matching stock unit, and available inventory.

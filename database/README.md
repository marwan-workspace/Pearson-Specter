# PostgreSQL database

`schema.sql` defines the mission database, demo crew, watch rules and medications, login/session tables, command chain, and row-level access policies. It targets PostgreSQL 13 or later. Apply it once to the hosted Supabase Postgres project before starting the service.

## Initialize Supabase

1. Create a Supabase project and copy its Postgres connection string into the repository root `.env` as `DATABASE_URL`.
2. Apply `database/schema.sql` using the Supabase SQL editor (or Supabase CLI). The service does not run migrations at startup.
3. Set four private PIN values in `.env`: `DEMO_PIN_ELENA`, `DEMO_PIN_KWAME`, `DEMO_PIN_HIRO`, and `DEMO_PIN_MAYA`. Each must be 4 to 12 digits.
4. From `backend/`, run `npm install` and `npm run seed:accounts`. The script hashes each PIN with scrypt before storing it.

The schema installer needs permission to create the `app_user` and `watch_service` roles, grant role membership to the connection user, and grant `BYPASSRLS` to `watch_service`. If the SQL editor reports a role privilege error, apply the role statements using the Supabase database owner.

## Local service

Start the API from `backend/` with `npm start`. It listens on port 8000. Start the dashboard separately with `npm run dev` from `web-frontend/`; the Next.js rewrite sends `/backend/*` requests to the API. The API reads `.env` from the repository root. Python packages in `requirements.txt` and the checked-in watch model are required for watch and Gemini agent workers.

Optional backend settings:

- `PORT` changes the API port (default `8000`).
- `BACKEND_URL` changes the origin used by the Next.js rewrite (default `http://localhost:8000`).
- `WATCH_ENABLED=false` disables the background watch/deadline worker; `WATCH_TICK_MS` sets its tick interval (default `60000`).
- `PYTHON_BIN` selects a Python executable if the repository virtual environment is not suitable.

## Access model

Every web request runs as `app_user` inside a transaction and sets `app.astronaut_id`; PostgreSQL RLS applies the own-or-decider policies. Authentication uses a random cookie token while the database stores only its SHA-256 hash. The watch loop uses `watch_service`, which bypasses RLS and is never exposed to a browser request.

The demo crew is seeded in this order: Elena (1), Kwame (2), Hiro (3), Maya (4). Stock quantities are intentionally left unseeded because the planning files do not specify reviewed on-board inventory. The medicine names and rule rows are seeded from `watch/rules.json`; dose suggestions have no reviewed quantities. The service will not approve or record a dose as administered until both are configured alongside matching inventory.

The demo mission starts at Mars with a 1,500-second Earth round trip, a 30-second simulated review interval, and Earth contact available. The acting leader can change the mission location or simulate loss/restoration of Earth contact from the dashboard. Outbound reports queue while offline; the worker records a simulated acknowledgment after the configured round-trip and review time. This does not connect to a real mission-command service.

## Data boundaries

- `astronauts` exposes crew identity and command rank within a mission.
- `agent_messages` is readable only by the conversation owner. `agent_conversations.summary` is readable by the decider.
- A crewmate can see an alert addressed to them, without gaining access to the subject's measurements.
- Weekly mission reports are visible to the acting leader; emergency reports are visible to the subject and their decider.
- Dataset files remain under `raw/raw/`; they are not copied into the runtime schema.

# Pearson-Specter

Astronaut health monitoring demo with a JavaScript API, PostgreSQL row-level security, a Next.js crew dashboard, and existing Python watch and manager-agent workers.

## Start here

For an already configured checkout, run `node scripts/run.mjs` from the repository root. It applies pending migrations, builds the current frontend, starts both services in production mode, and verifies that their build IDs match. Logs and process IDs are in ignored `.runtime/`. Use `node scripts/run.mjs --dev` while editing, and `node scripts/run.mjs --stop` to stop services started by this command. It will not silently replace unmanaged processes already using ports 3000 or 8000.

1. Add `DATABASE_URL`, `GEMINI_API_KEY`, and four `DEMO_PIN_*` values to the ignored root `.env` file.
2. From `backend/`, run `npm install`, `npm run db:migrate`, and `npm run seed:accounts` once for a new database.
3. From `backend/`, run `npm start` if starting the API separately.
4. Install Python requirements from the repo root with `pip install -r requirements.txt`.
5. From `web-frontend/`, run `npm install` and `npm run dev`.

The backend stores sessions and mission data in PostgreSQL. The acting team leader sees the crew overview and decision queue; crew members see their own data and decisions assigned to them. See [`database/README.md`](database/README.md) for database roles, setup and access rules, and [`backend/README.md`](backend/README.md) for the API surface.

Product requirements and feature definitions are in [`FEATURES.md`](FEATURES.md); command-chain and backend decisions are in [`BACKEND_PLAN.md`](BACKEND_PLAN.md).

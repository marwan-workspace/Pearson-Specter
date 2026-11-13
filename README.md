# Pearson-Specter

Astronaut health monitoring demo with a JavaScript API, PostgreSQL row-level security, a Next.js crew dashboard, and existing Python watch and manager-agent workers.

## Start here

1. Apply [`database/schema.sql`](database/schema.sql) to the hosted Supabase Postgres project.
2. Add `DATABASE_URL`, `GEMINI_API_KEY`, and four `DEMO_PIN_*` values to the ignored root `.env` file.
3. From `backend/`, run `npm install`, `npm run seed:accounts`, then `npm start`.
4. Install Python requirements from the repo root with `pip install -r requirements.txt`.
5. From `web-frontend/`, run `npm install` and `npm run dev`.

The backend stores sessions and mission data in PostgreSQL. The acting team leader sees the crew overview and decision queue; crew members see their own data and decisions assigned to them. See [`database/README.md`](database/README.md) for database roles, setup and access rules, and [`backend/README.md`](backend/README.md) for the API surface.

Product requirements and feature definitions are in [`FEATURES.md`](FEATURES.md); command-chain and backend decisions are in [`BACKEND_PLAN.md`](BACKEND_PLAN.md).

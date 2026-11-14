# Running the current version

Install the locked Node/Python dependencies, configure the ignored root `.env`, and provision demo PIN accounts once. Run `node scripts/run.mjs` from the repository root for normal use. This applies pending database migrations and builds/starts the frontend and API from the same checkout. Open http://localhost:3000. `/version` and `/backend/health` must report the same `build` value; health also reports the backend source hash and schema version. Runtime logs and process IDs live in ignored `.runtime/`.

Use `node scripts/run.mjs --dev` for development and `node scripts/run.mjs --stop` to stop managed services. The launcher verifies stored process command lines before terminating them. It refuses to silently replace unmanaged processes on ports 3000/8000. A raw `npm start` in `backend/` does not apply migrations; use `npm run db:migrate` first.

## Hosting and latency

The local backend's database round trip was approximately 374 ms during the audit. A production backend should run in the same region as PostgreSQL using a private connection where available. Choose that region in the actual hosting account, keep `DATABASE_URL` and `GEMINI_API_KEY` server-side, and use HTTPS. The code changes do not relocate the existing hosted database or deploy to a provider.

Keep the PostgreSQL session-pool limit above the combined API, worker and job-lock connections of the intended replicas. Each process currently allows 6 API connections, 1 worker connection and 1 dedicated advisory-lock connection. Multiple replicas share the global two-job execution limit and watch leader lock, but their connection pools still add up. Use a session-mode database connection for the watch advisory lock. Do not point it at a transaction-mode pooler.

Use production builds for normal use. The frontend now bootstraps the dashboard with one snapshot and loads only the current record tab, with updated-row sync and bounded history pages. Private API responses remain `no-store`; do not add a public CDN cache to medical/session data. JSON compression is negotiated with `Accept-Encoding`.

Long agent operations use persistent jobs rather than keeping the browser request open through Gemini inference. The existing 120-second proxy timeout is retained for legacy clients; it is not a performance substitute for the job flow. External model latency and hosting-region choices still affect completion times.

## Tests

Run Python tests with `python -m unittest discover -s tests -v`. The live Gemini tests require `RUN_LIVE_TESTS=1` and use quota.

For Node/database regression tests, set `DATABASE_URL_TEST` to an empty disposable database and run `npm test` in `backend/`. Never use the mission database as the test database: fixtures change accounts, events and decisions. `REQUIRE_DB_TESTS=1` prevents an accidental skipped database suite. GitHub Actions provisions an isolated PostgreSQL instance automatically. Run `npm run build` in `web-frontend/` for the frontend/TypeScript check.

No credentials or PIN values belong in tracked files.

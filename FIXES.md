# Applied fixes and verification

Changes are uncommitted. The configured database was upgraded to schema version 3. The app is running in production mode from the updated working tree; `/version` and `/backend/health` report matching build IDs. Use `node scripts/run.mjs` to rebuild/restart the current source and `--dev` for editing.

## Correctness and consistency

- Plan approvals lock their shared parent inside a narrowly authorized database function. Concurrent approvals finalize the plan; duplicate clicks return a conflict.
- Escalated recipients can resolve the specific assigned item, including rejection, without gaining access to the subject's full private record. Failed linked updates roll back instead of silently succeeding.
- The migration repairs old rejected items/unfinished parent statuses and pending actions attached to closed events.
- Check-in completion is serialized per astronaut/date. A unique check-in link prevents duplicate sleep rows. Completed records cannot be reopened by an older reply; older partial conversations are rejected. Repeating a completed check-in does not call Gemini again.
- Body shapes, IDs, actual calendar dates, history cursors, conversation sizes and report periods are checked before expensive work. Invalid input returns a client error rather than a generic 500.
- Read transactions await COMMIT before returning their database client to the pool.
- Login requests are throttled by direct source address in addition to the existing account lockout.
- Session expiry clears the UI, and older session refresh responses cannot overwrite a later logout.

## Normal readings with an unresolved event

The live browser suit stream is a simulation; stored clinical events are separate records. Normal values do not automatically prove that a manually reported concern has been reviewed.

| Situation | Implemented behavior |
|---|---|
| A fresh, valid watch reading clears an event's flag | Resolve that watch episode, resolve its linked alerts, cancel its pending decisions and unadministered actions, retain administered-dose history. |
| A different abnormal condition becomes the selected condition | Keep the earlier event if its flag is still present. |
| The sensor fails while a physiological event is open | Preserve the physiological event. Missing/invalid readings are not evidence of recovery. |
| A stored simulator event remains open while the watch is normal | Show its source and an explicit **End simulator scenario** review action in Events. |
| A manually reported event remains open | Provide **Mark reviewed and resolved**, with confirmation and server-side ownership/decider checks. |
| An older release closed an event but left actions open | Reconcile those pending links during migration and subsequent watch updates. |
| Assessment includes a resolved or simulator critical event | Preserve it as context; it no longer forces the current assessment into urgent status. |

The record header uses a fresh active-event snapshot independent of history pagination. Dashboard counts and latest readings are read in the same database snapshot. Updated-row synchronization refreshes resolved statuses; returning to the tab triggers an immediate refresh. Open simulator/manual records are described as unresolved records requiring review, rather than silently erased because displayed numbers look normal.

## Loading and worker improvements

- One dashboard snapshot replaces four polling requests; it polls every five seconds instead of every two.
- Initial record loading fetches the current tab's streams, bounded history and current events. Raw watch payloads and repeated decision evidence are excluded. Historical data loads on demand with timestamp-and-ID pagination, including rows sharing the same timestamp.
- Mutable rows have `updated_at` synchronization; item changes update their parent plan. The page no longer reloads every historical stream every 30 seconds just to discover state changes.
- Related alerts, stock, decisions and roster are combined in one scoped request. Private chat loads only on the owner's Agent tab.
- JSON responses negotiate gzip. Private responses remain `no-store`.
- Agent operations use persistent jobs, two global workers, a bounded queue and per-user limits. Duplicate in-flight requests coalesce; request IDs can replay the original result. The UI polls job status instead of holding the browser connection through model inference.
- Queued jobs survive restart. Interrupted running jobs become failed after three minutes, with an instruction to refresh before retrying. Results expire after one day. Permissions are checked again when a job reads/writes mission data.
- The launcher applies pending migrations, checks managed process ownership and verifies matching frontend/backend versions before reporting readiness. Normal use runs a production build.
- Python dependencies are locked to the tested installed versions. CI provisions a disposable PostgreSQL database, exercises the backend/Python tests and builds the frontend; missing database configuration is a CI failure rather than a successful skipped suite.

## Measured result

Same local machine and configured remote database; small HTTP samples, not a browser benchmark or sustained load test.

| Measurement | Original audit | Updated application |
|---|---|---|
| Dashboard data | Four calls; approximately 1.4–2.7 seconds with a fresh backend | One snapshot; approximately 1.13–1.15 seconds |
| Initial record response | Approximately 366 KiB decoded JSON; 2.25–3.31 seconds | Approximately 88 KiB decoded JSON; 1.51–1.98 seconds |

The record comparison intentionally measures first-screen loading: other tab/history data remains accessible on demand. This is about 76% less initial decoded data, before transport compression. Database distance still contributes approximately 374 ms per round trip; the deployment guide explains how to place the backend near PostgreSQL.

Real Gemini pipeline checks used synthetic records in the isolated local database. Job acceptance took 4–23 ms locally; completion took approximately 11 seconds for check-in, 18 seconds for assessment and 21 seconds for the weekly report. These are observed samples, not completion-time guarantees. Repeated submissions returned the same active job ID. The check-in, exactly one linked sleep session, assessment, treatment plan and four-person weekly report were read back from the database/API.

## Verification

- **19 backend tests passed**, including real isolated PostgreSQL tests for concurrent approvals, escalation scope, event/alert/action recovery, sensor failure, multiple flags, simulator review, duplicate check-in completion, old-state repair, pagination, validation and job privacy/deduplication/capacity.
- **29 Python tests passed**, including the new resolved/simulator-event assessment case. Two separately opt-in live unit tests were skipped; real model integration was exercised through the job/API flows above.
- Production frontend compilation and TypeScript passed.
- The configured database reports **0 stuck finalized plans, 0 orphan pending alerts and 0 orphan pending medication actions attached to closed events** after migration.
- The app's actual same-origin API path returned 200 for version/health, sign-in, dashboard, current record and related data. Frontend/backend build IDs match.
- Server and frontend error logs were empty during the final live verification.
- Knowledge graph updated; whitespace checks passed.

## External checks remaining

- Browser access is unavailable in this session. Actual clicks, responsive screenshots, console output, GPU/frame-rate measurements and browser-specific cookie/cache behavior were not visually rechecked. HTTP/API/database checks are not presented as browser verification.
- The backend/database were not moved to a new hosting region or provider. That requires an actual deployment target/account decision; see [DEPLOYMENT.md](DEPLOYMENT.md). The remaining network latency cannot be removed solely through local source edits.
- The new GitHub Actions workflow has been added but has not been pushed or run remotely. No commits or deployments were made.

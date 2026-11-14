# Repository audit — 14 November 2026

> **Remediation applied:** the findings below describe the original audit. The fixes, database migrations, current verification results and remaining external checks are recorded in [FIXES.md](FIXES.md).

Audited `main`, commit `79aec30` (`Merge pull request #4 from marwan-workspace/dev`). Product source was left unchanged. Temporary database fixtures and test sessions were used; no treatment decisions or medical records in the configured hosted database were changed by this audit.

## Assessment

The application builds, its core Python logic passes the offline tests, and the main authenticated read APIs work in a fresh backend process. It is a functioning demo, but the currently running frontend/backend pair is mismatched, and approval edge cases are not reliable. A successful `/health` response alone does not establish that the app works.

The highest performance cost measured here is communication between the local backend and remote PostgreSQL, followed by fetching more record data than the first screen needs. The HTML server and initial JavaScript are secondary targets.

## Confirmed findings, ordered by priority

### 1. High — the running backend does not match the frontend/source

- Current frontend: `web-frontend/src/lib/useRecord.ts:60` requests `/astronauts/:id/record`.
- Current backend implements that route in `backend/server.js:203`.
- The existing backend on port 8000 returned **404** for the authenticated record request twice.
- A fresh process of the current backend on port 8002 returned **200** for the same kind of authenticated request twice.
- Impact: the current record screen can fail even though homepage and health checks return 200.
- Fix: restart both services from the same checkout/build; add build/commit identifiers to health responses and startup logs. Verify an authenticated record request after startup, rather than only `/health`.

### 2. High — concurrent approvals can strand a completed plan

Source: `backend/server.js:248–255`.

Each decision is conditionally updated, then the request checks whether any sibling decision is still proposed. There is no lock on the shared plan before resolving its items. Two transactions can each accept a different decision and each observe the other's uncommitted decision as proposed. Both skip finalizing the plan.

Confirmed with a deterministic interleaving of the same SQL logic in an isolated PostgreSQL database:

```json
{"snapshots":[{"pending":true,"accepted":true},{"pending":true,"accepted":true}],"saved":{"status":"awaiting_approval","remaining":0}}
```

Fix: serialize decisions belonging to the same plan with a plan-level lock before updating decisions, then finalize the plan inside that transaction. Keep the existing conditional decision update. The sequential bulk-approval UI avoids this within that one loop, but separate tabs or users can still race.

### 3. High — rejecting an escalated plan decision silently leaves its item and parent unchanged

Sources: `backend/server.js:248–258`; `database/schema.sql` policies `escalated_plan_read`, `escalated_plan_item_update`, and `escalated_plan_update`.

The decision update allows the escalated recipient. After changing the decision to `rejected`, the escalated plan read/update policies no longer permit access: they require `proposed`/`accepted` for reading and `accepted` for updates. Item visibility is also tied to ordinary subject visibility. The handler ignores affected-row counts when updating items and plans.

Confirmed in the isolated database using an escalated recipient who is not the subject's normal decider:

```json
{"decisionRows":1,"itemRows":0,"parentRows":0,"saved":{"plan_status":"awaiting_approval","item_status":"planned"}}
```

Fix: narrowly authorize resolution of the linked plan/item for both accepted and rejected decisions, including the necessary SELECT policy; check expected affected-row counts and roll back on inconsistency. Add actual escalated-recipient tests.

### 4. Medium — two checked-in database tests fail before testing the feature

Source: `backend/smoke.test.js:51,53,68,72`.

Both plan-approval tests omit required `rationale` values from `treatment_plans` and `decisions` fixture inserts. Against a fresh local PostgreSQL cluster, the checked-in suite produced **4 pass / 2 fail**, with PostgreSQL error `23502` for `treatment_plans.rationale`.

A temporary copy supplying the missing fixture rationale fields passed **all 6 tests**. That copy was diagnostic only; the repository tests were not silently edited. With no `DATABASE_URL_TEST`, the ordinary test command skips all six tests and still exits successfully.

Fix: repair the fixtures, run the suite against a disposable database in CI, and make the CI job fail if database tests are unexpectedly skipped. Add concurrent approval, escalated rejection, and duplicate check-in completion coverage.

### 5. Medium — malformed requests become internal server errors

Sources: `backend/server.js:35–41` (`parseBody`), `:410` (`isDate`), and UUID-based route queries such as `/reports/:id`.

Confirmed against the current backend using the isolated database:

| Request | Actual | Expected |
|---|---:|---:|
| Login with JSON `null` | 500 | 400 |
| Weekly report with `periodStart: "2026-02-30"` | 500 | 400 |
| GET `/reports/not-a-uuid` | 500 | 400 or 404 |

`Date.parse` normalizes some impossible calendar dates; it does not prove the original date is valid. `parseBody` accepts JSON values that are not objects. UUID parameters reach PostgreSQL without shape validation.

Fix: validate object bodies, strict calendar dates, UUIDs, and command-specific fields at the HTTP boundary. Return client errors without exposing SQL details. PostgreSQL rejection prevented these requests from writing a report.

## Other code-review risks needing regression coverage

- **Concurrent check-in completion:** `runAgent` reads `wasCompleted` before the check-in upsert and subsequent sleep insert. Two simultaneous completion requests can both read false and each insert a sleep session after the upserts serialize. A completed check-in can also be downgraded by a later incomplete response. Use an atomic completion transition and a unique relationship between a check-in and its sleep record. This was identified from the transaction logic, not reproduced against hosted records.
- **Unbounded worker concurrency:** each authenticated agent request can spawn a Python process and call Gemini. There is no global/per-user worker queue or deduplication of identical in-flight requests. A burst can increase memory, latency, quota use, and duplicate assessments/reports. Add bounded execution, idempotency, and clear busy responses.
- **Login abuse controls:** accounts lock after five bad PINs, which is implemented and tested; there is no IP-level/request-rate limiter. Unknown logins perform expensive password hashing and still use database resources. Add throttling and audit events before exposing this beyond a trusted demo environment.
- **Read transaction completion:** `appTransaction(..., true)` releases a pooled client before awaiting COMMIT and discards COMMIT errors. The client queues the COMMIT, so this moves latency into later work rather than removing it. Await transaction completion and discard a broken connection; measure response improvements at the query/API design level.
- **Python reproducibility:** `pandas` and `google-genai` are unpinned in `requirements.txt`. Use a lock file or constrained versions so a clean setup has the same tested dependency set. No Python vulnerability database scan was performed.

## Loading measurements

Local measurements; two HTTP samples per page/API comparison. These are not browser rendering, Lighthouse, or load-test results. Warm/cold effects, database load, and network conditions affect the numbers.

| Measurement | Result |
|---|---|
| Existing development homepage HTTP response | 82–169 ms |
| Temporary production homepage HTTP response | 11–148 ms |
| Production astronaut route HTTP response | 210 ms |
| Initial astronaut-route script references | 11 scripts; 687,837 decoded bytes; ~214,318 bytes when gzip-estimated locally |
| Existing backend dashboard batch (four requests in parallel) | ~2.2–4.5 seconds to finish |
| Fresh current backend dashboard batch | ~1.4–2.7 seconds to finish |
| Fresh current backend record response | 2,252–3,305 ms; 374,813 decoded bytes (~366 KiB) |
| Remote PostgreSQL connection establishment | ~1.5–2.4 seconds |
| Remote PostgreSQL `SELECT 1` round trip | ~370–374 ms |
| Indexed 3-hour vital query under app role, with visible records | ~1.5 ms SQL execution; 487 returned rows |

The SQL timing is one representative query, not the entire record query. It supports the diagnosis of expensive network round trips, not a claim that every database query is fast. All four astronauts had fresh stored watch readings at the final database check. An existing log contained a watch connection timeout; the timestamp of that historical entry could not be established.

## Speed improvements, in recommended order

1. **Align the running services first.** A 404 record request cannot be optimized into a working screen. Use one reproducible start command and a build identifier.
2. **Run production builds for normal use.** `npm run build` followed by `npm start` avoids development compilation overhead. Keep development mode for editing. Preserve server-side credentials and the existing same-origin API boundary.
3. **Place the backend near PostgreSQL.** The measured ~374 ms database round trip multiplies across session setup, authorization, subject resolution, and data queries. Co-location should be measured before and after deployment; no specific improvement factor is guaranteed.
4. **Combine dashboard bootstrap/poll requests.** `CrewOverview.tsx:89–99` fetches overview, pending decisions, reports, and command data every two seconds. A single authorized snapshot removes repeated session setup and overlapping command-chain work. Keep authorization and row isolation inside the aggregate handler.
5. **Load only the record data needed for the visible tab.** The record request gathers all ten streams before showing the screen. Fetch recent vitals/latest summary first, and load historical sleep, labs, plans, and messages when their tabs need them. Replace `SELECT *` with needed columns, exclude repeated raw payloads, paginate history, and verify response compression.
6. **Reduce polling and full-history reloads.** Current records poll every 2 seconds, related data every 10 seconds, and the full record every 15 record polls. Use slower polling for stable data, immediate invalidation after writes, and `updated_at` cursors for mutable rows. Consider authenticated SSE only if the simpler polling changes are insufficient. Do not cache private medical responses publicly or share them across users.
7. **Treat long agent operations as jobs.** The backend already releases database connections while Gemini runs, which is good. For reports/assessments, add a bounded background job with progress/status and deduplicate equivalent requests. The 120-second proxy timeout prevents premature disconnects; it does not make Gemini answer faster.
8. **Optimize 3D after browser profiling.** The renderer already loads dynamically, uses ResizeObserver, limits pixel ratio to 2, and skips hidden/offscreen rendering. Preserve those protections. Profile mobile GPU cost before reducing pixel ratio, anti-aliasing, geometry, or frame rate. The initial JS estimate excludes later dynamic chunks and model assets; browser access is needed to measure their actual impact.

## Verification completed

- Production Next.js build and TypeScript stage: **passed**.
- Python unittest discovery: **28 passed, 2 live-Gemini tests skipped**.
- Checked-in backend suite with no test database: **6 skipped**.
- Checked-in backend suite with a fresh isolated PostgreSQL database: **4 passed, 2 fixture failures**.
- Temporary corrected-fixture copy: **6 passed**.
- Isolated transaction probes: concurrent plan-finalization failure and escalated-rejection inconsistency confirmed.
- Current backend authenticated read APIs: dashboard and record endpoints returned 200.
- Authorization samples: unauthenticated `/me` returned 401; a member's leader dashboard and another member's record returned 403; their own record returned 200; another astronaut's private chat returned 403.
- Hosted database: sampled role-aware query timing and latest watch timestamps with read-only queries.
- npm audit: **0 reported vulnerabilities** in both installed frontend and backend dependency trees at audit time. This is not a general security certification.
- `.env` is ignored and was not found in Git's tracked-file list. Credential values were not included in this report.

## Limitations

Browser automation was unavailable, so UI click behavior, console errors, responsive layouts, real rendering speed, mobile frame rate, and browser cache behavior were not verified. New live Gemini requests were not made in this audit; earlier session results are not presented as fresh verification. This audit did not exercise actual medication administration, production deployment, third-party outages, sustained load, or every command handover combination.

The temporary production server, audit backend, test backend, and isolated PostgreSQL instance were stopped after the audit. The existing user-facing services were left running. No product fixes or commits were made as part of this audit.

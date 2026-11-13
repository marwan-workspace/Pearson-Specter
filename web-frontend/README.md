# Crew Health dashboard

Next.js frontend for the astronaut health monitoring demo. The dashboard reads and writes mission data through the JavaScript API at `/backend/*`; Next.js rewrites those requests to `BACKEND_URL` (default `http://localhost:8000`). The browser stores only the HttpOnly session cookie. The backend and database setup is documented in [`../database/README.md`](../database/README.md).

## Run locally

Requires Node.js 20.9 or newer.

1. Apply `database/schema.sql` and provision the four crew PINs as described in the database README.
2. Install and start the API from `backend/` with `npm install` and `npm start`.
3. From `web-frontend/`, run `npm install` and `npm run dev`.
4. Open http://localhost:3000 and sign in as `elena`, `kwame`, `hiro`, or `maya` using the PIN configured for that account.

The acting team leader sees the crew overview, decision queue, reports and command handover controls. Every crew member sees their own record, check-in, private manager-agent chat, and decisions assigned to them. PostgreSQL RLS remains the authority for record access.

## Connected API features

- Live vitals, sleep, mental-health, check-in, assessment, plan, medication, lab and watch-event records poll every two seconds.
- Login and logout use cookie-backed database sessions.
- Check-in, chat and assessment requests run through the existing Python/Gemini worker and save their outputs to PostgreSQL.
- The leader can create a weekly report, inject simulator scenarios and hand over or restore command.
- Crew members can acknowledge alerts; an alerted recipient can mark an approved or timed-out Tier 3 medication as given.

The dashboard keeps a plain data view for records. The 3D suit, local simulation data and Earth-delay controls remain in the repository as design assets, but are not used as the authenticated data source.

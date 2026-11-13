# PostgreSQL database

`schema.sql` creates the database structure for the astronaut health monitoring demo. It targets PostgreSQL 13 or later and uses UUID keys, `timestamptz` timestamps, `jsonb` payloads, foreign keys, checks, and indexes. It does not create a database or application user.

## Initialize

Create a database, then apply the schema:

```sh
createdb astronaut_health
psql -d astronaut_health -v ON_ERROR_STOP=1 -f database/schema.sql
```

The schema uses PostgreSQL's built-in `gen_random_uuid()` function. A database connection should use UTC for consistent display and serialize timestamps with their timezone.

## Main data flows

- `missions` and `astronauts` scope crew data to each mission.
- `vital_samples` stores simulator replays and future watch readings, including activity context, sensor condition, and radiation rate.
- `sleep_sessions`, `sleep_stages`, `check_ins`, and `check_in_answers` store sleep and self-reports. Versioned question keys support selecting a mental health questionnaire later.
- `agent_conversations` and `agent_messages` store manager-agent interactions outside daily check-ins.
- `health_assessments`, `condition_events`, `rule_sets`, `rules`, and `decisions` record evaluations, detected conditions, rule provenance, and agent/watch reasoning.
- `crew_alerts` tracks crewmate notifications and acknowledgements.
- `medications`, `medication_inventory`, and `medication_events` track stock, confirmation/cancel windows, and reported actions.
- `treatment_plans` and `treatment_plan_items` hold recommendations and approval state.
- `mission_reports` and `mission_command_replies` support weekly and emergency reports that can remain queued during Earth communication delays.
- `lab_results` supports the later manual blood-test feature.

## Safety and data boundaries

No medication dose recommendations or clinical thresholds are seeded. The schema records events; it does not validate medical decisions or control hardware. The application must enforce confirmation and cancel-window rules and update inventory in a transaction. Keep the applicable ruleset version attached to each decision.

Raw research datasets remain in `raw/raw/`; this schema stores normalized demo/runtime records, not bulk copies of source files. Preserve dataset attribution with any derived rule or replay configuration.

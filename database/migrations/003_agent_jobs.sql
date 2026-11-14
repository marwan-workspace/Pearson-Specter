BEGIN;
CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astronaut_id UUID NOT NULL REFERENCES astronauts(id),
  request_key UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  command TEXT NOT NULL CHECK(command IN ('assess','weekly','checkin','chat','emergency')),
  input JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
  result JSONB,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ,
  UNIQUE(astronaut_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_matching_active_job ON agent_jobs(astronaut_id,fingerprint) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS queued_agent_jobs ON agent_jobs(status,created_at);
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_jobs ON agent_jobs;
CREATE POLICY own_jobs ON agent_jobs FOR SELECT TO app_user USING(astronaut_id=app_astronaut_id());
DROP POLICY IF EXISTS create_own_jobs ON agent_jobs;
CREATE POLICY create_own_jobs ON agent_jobs FOR INSERT TO app_user WITH CHECK(astronaut_id=app_astronaut_id());
GRANT SELECT,INSERT ON agent_jobs TO app_user;
GRANT SELECT,INSERT,UPDATE,DELETE ON agent_jobs TO watch_service;
CREATE OR REPLACE FUNCTION agent_queue_depth() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT count(*)::int FROM agent_jobs WHERE status IN ('queued','running') AND app_astronaut_id() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION agent_queue_depth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agent_queue_depth() TO app_user;
INSERT INTO schema_migrations(version,description) VALUES(3,'Bounded persistent agent jobs with per-user idempotency') ON CONFLICT DO NOTHING;
COMMIT;

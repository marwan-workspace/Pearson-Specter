BEGIN;

ALTER TABLE sleep_sessions ADD COLUMN IF NOT EXISTS source_check_in_id UUID REFERENCES check_ins(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sleep_one_per_checkin ON sleep_sessions(source_check_in_id) WHERE source_check_in_id IS NOT NULL;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['sleep_sessions','check_ins','health_assessments','condition_events','decisions','medication_events','treatment_plans','lab_results'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp()',t);
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I',t);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(astronaut_id,updated_at)', 'sync_'||t,t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION touch_parent_plan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN UPDATE treatment_plans SET updated_at=clock_timestamp() WHERE id=NEW.treatment_plan_id; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS touch_parent_plan ON treatment_plan_items;
CREATE TRIGGER touch_parent_plan AFTER INSERT OR UPDATE ON treatment_plan_items FOR EACH ROW EXECUTE FUNCTION touch_parent_plan();

-- One parent lock serializes all of a plan's decisions, even across users and server processes.
-- Authority is checked inside this narrow operation; ordinary app table permissions do not expand.
CREATE OR REPLACE FUNCTION resolve_plan_decision(p_id UUID,p_action TEXT) RETURNS decisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d decisions%ROWTYPE; p treatment_plans%ROWTYPE; v_actor UUID := app_astronaut_id();
BEGIN
  IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Action must be approve or reject' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM decisions WHERE id=p_id AND decision_type='plan_approval';
  IF NOT FOUND OR v_actor IS NULL OR (decider_for(d.astronaut_id) IS DISTINCT FROM v_actor AND d.escalated_to_astronaut_id IS DISTINCT FROM v_actor) THEN
    RAISE EXCEPTION 'This decision is not yours to decide' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM treatment_plans WHERE id=(d.evidence->>'treatmentPlanId')::uuid AND astronaut_id=d.astronaut_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The decision has no matching plan' USING ERRCODE='23514'; END IF;
  SELECT * INTO d FROM decisions WHERE id=p_id FOR UPDATE;
  IF d.outcome IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'This decision was already resolved' USING ERRCODE='P0002'; END IF;
  UPDATE treatment_plan_items SET status=CASE WHEN p_action='approve' THEN 'planned' ELSE 'skipped' END
    WHERE id=(d.evidence->>'treatmentPlanItemId')::uuid AND treatment_plan_id=p.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The decision has no matching plan item' USING ERRCODE='23514'; END IF;
  UPDATE decisions SET outcome=CASE WHEN p_action='approve' THEN 'accepted' ELSE 'rejected' END,
    decided_by_astronaut_id=v_actor,decided_at=now() WHERE id=p_id RETURNING * INTO d;
  IF NOT EXISTS(SELECT 1 FROM decisions WHERE decision_type='plan_approval' AND evidence->>'treatmentPlanId'=p.id::text AND outcome='proposed') THEN
    UPDATE treatment_plans SET status=CASE WHEN EXISTS(SELECT 1 FROM decisions WHERE decision_type='plan_approval'
      AND evidence->>'treatmentPlanId'=p.id::text AND outcome='accepted') THEN 'approved' ELSE 'rejected' END,
      approved_by_astronaut_id=v_actor,approved_at=now() WHERE id=p.id;
  END IF;
  RETURN d;
END $$;

DROP POLICY IF EXISTS escalated_plan_read ON treatment_plans;
CREATE POLICY escalated_plan_read ON treatment_plans FOR SELECT TO app_user USING (
  EXISTS(SELECT 1 FROM decisions d WHERE d.escalated_to_astronaut_id=app_astronaut_id()
    AND d.evidence->>'treatmentPlanId'=treatment_plans.id::text));
DROP POLICY IF EXISTS escalated_plan_item_read ON treatment_plan_items;
CREATE POLICY escalated_plan_item_read ON treatment_plan_items FOR SELECT TO app_user USING (
  EXISTS(SELECT 1 FROM decisions d WHERE d.escalated_to_astronaut_id=app_astronaut_id()
    AND d.evidence->>'treatmentPlanItemId'=treatment_plan_items.id::text));

CREATE OR REPLACE FUNCTION close_condition_event(p_id UUID,p_reason TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e condition_events%ROWTYPE; actor UUID := app_astronaut_id(); worker BOOLEAN := current_setting('role',true)='watch_service';
BEGIN
  SELECT * INTO e FROM condition_events WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF NOT worker AND (actor IS NULL OR (actor IS DISTINCT FROM e.astronaut_id AND actor IS DISTINCT FROM decider_for(e.astronaut_id))) THEN
    RAISE EXCEPTION 'You cannot resolve this event' USING ERRCODE='42501';
  END IF;
  IF NOT worker AND e.reported_by='watch' THEN RAISE EXCEPTION 'Watch events close after a valid recovered reading' USING ERRCODE='P0002'; END IF;
  IF e.status NOT IN ('open','monitoring') THEN RETURN FALSE; END IF;
  UPDATE condition_events SET status='resolved',ended_at=now(),summary=concat_ws(' ',summary,left(p_reason,500)) WHERE id=p_id;
  UPDATE crew_alerts SET status='resolved' WHERE condition_event_id=p_id AND status IN ('pending','acknowledged');
  UPDATE medication_events SET status='cancelled',cancelled_at=now(),notes=concat_ws(' ',notes,'Event resolved before administration.')
    WHERE condition_event_id=p_id AND status IN ('proposed','awaiting_confirmation','confirmed','crew_action_required');
  UPDATE decisions SET outcome='cancelled',decided_at=now(),rationale=concat_ws(' ',rationale,'Event resolved; pending action cancelled.')
    WHERE condition_event_id=p_id AND outcome='proposed';
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION resolve_plan_decision(UUID,TEXT),close_condition_event(UUID,TEXT),touch_parent_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_plan_decision(UUID,TEXT),close_condition_event(UUID,TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION close_condition_event(UUID,TEXT) TO watch_service;

-- Repair historical partial resolutions from the previous handler. Completed work is preserved.
UPDATE treatment_plan_items i SET status='skipped' FROM decisions d,treatment_plans p
  WHERE d.decision_type='plan_approval' AND d.outcome='rejected' AND i.status='planned'
    AND d.evidence->>'treatmentPlanItemId'=i.id::text AND d.evidence->>'treatmentPlanId'=p.id::text
    AND i.treatment_plan_id=p.id AND d.astronaut_id=p.astronaut_id;
UPDATE treatment_plans p SET status=CASE WHEN EXISTS(SELECT 1 FROM decisions d WHERE d.decision_type='plan_approval'
    AND d.evidence->>'treatmentPlanId'=p.id::text AND d.outcome='accepted') THEN 'approved' ELSE 'rejected' END,
  approved_by_astronaut_id=(SELECT d.decided_by_astronaut_id FROM decisions d WHERE d.decision_type='plan_approval'
    AND d.evidence->>'treatmentPlanId'=p.id::text AND d.outcome IN ('accepted','rejected') ORDER BY d.decided_at DESC LIMIT 1),approved_at=now()
  WHERE p.status='awaiting_approval' AND EXISTS(SELECT 1 FROM decisions d WHERE d.decision_type='plan_approval' AND d.evidence->>'treatmentPlanId'=p.id::text)
    AND NOT EXISTS(SELECT 1 FROM decisions d WHERE d.decision_type='plan_approval' AND d.evidence->>'treatmentPlanId'=p.id::text AND d.outcome='proposed');
UPDATE crew_alerts ca SET status='resolved' FROM condition_events e
  WHERE ca.condition_event_id=e.id AND e.status IN ('resolved','false_alarm') AND ca.status IN ('pending','acknowledged');
UPDATE medication_events me SET status='cancelled',cancelled_at=now(),notes=concat_ws(' ',me.notes,'Closed event; pending action reconciled during upgrade.') FROM condition_events e
  WHERE me.condition_event_id=e.id AND e.status IN ('resolved','false_alarm') AND me.status IN ('proposed','awaiting_confirmation','confirmed','crew_action_required');
UPDATE decisions d SET outcome='cancelled',decided_at=now(),rationale=concat_ws(' ',d.rationale,'Closed event; pending action reconciled during upgrade.') FROM condition_events e
  WHERE d.condition_event_id=e.id AND e.status IN ('resolved','false_alarm') AND d.outcome='proposed';

INSERT INTO schema_migrations(version,description) VALUES(2,'Atomic decisions, event recovery and incremental record sync') ON CONFLICT DO NOTHING;
COMMIT;

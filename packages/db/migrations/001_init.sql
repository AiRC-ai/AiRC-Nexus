CREATE SCHEMA IF NOT EXISTS nexus;
REVOKE ALL ON SCHEMA nexus FROM PUBLIC;
GRANT USAGE ON SCHEMA nexus TO nexus_app, nexus_worker;

CREATE TABLE nexus.principals (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL CHECK(length(name) <= 120),
  kind text NOT NULL CHECK(kind IN ('human','agent','anonymous')),
  role text NOT NULL CHECK(role IN ('owner','reviewer','reader'))
);
CREATE TABLE nexus.teams (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE nexus.memberships (
  team_id uuid REFERENCES nexus.teams, owner_id uuid REFERENCES nexus.principals,
  PRIMARY KEY(team_id,owner_id)
);
CREATE TABLE nexus.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL,
  principal_id uuid NOT NULL REFERENCES nexus.principals,
  scopes text[] NOT NULL, kind text NOT NULL CHECK(kind IN ('agent','exchange','session')),
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE nexus.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), origin_node text NOT NULL DEFAULT 'nexus-local-demo',
  owner_id uuid NOT NULL REFERENCES nexus.principals, team_id uuid REFERENCES nexus.teams,
  current_revision_id uuid, visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','public')),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','quarantined','reviewable','published','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE nexus.record_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES nexus.records,
  sequence integer NOT NULL CHECK(sequence > 0), content jsonb NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(content->>'title','')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content->>'problem','')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content->>'resolution','')), 'B')
  ) STORED,
  UNIQUE(record_id,sequence), UNIQUE(record_id,id)
);
ALTER TABLE nexus.records ADD CONSTRAINT records_head_fk FOREIGN KEY(id,current_revision_id)
  REFERENCES nexus.record_revisions(record_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX revisions_search_idx ON nexus.record_revisions USING gin(search_vector);
CREATE INDEX records_owner_idx ON nexus.records(owner_id);
CREATE INDEX records_team_idx ON nexus.records(team_id);
CREATE INDEX revisions_record_idx ON nexus.record_revisions(record_id);
CREATE TABLE nexus.review_assignments (
  revision_id uuid REFERENCES nexus.record_revisions, reviewer_id uuid REFERENCES nexus.principals,
  PRIMARY KEY(revision_id,reviewer_id)
);
CREATE TABLE nexus.review_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid UNIQUE NOT NULL REFERENCES nexus.record_revisions,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), lease_id uuid, leased_until timestamptz,
  result jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX jobs_pending_idx ON nexus.review_jobs(state,created_at);
CREATE TABLE nexus.review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES nexus.record_revisions,
  reviewer_id uuid NOT NULL REFERENCES nexus.principals, digest text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved','rejected')), note text NOT NULL CHECK(length(note)<=1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX decisions_revision_idx ON nexus.review_decisions(revision_id,created_at DESC);
CREATE TABLE nexus.publication_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES nexus.record_revisions,
  owner_id uuid NOT NULL REFERENCES nexus.principals, digest text NOT NULL,
  visibility text NOT NULL CHECK(visibility IN ('private','team','public')),
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX grants_revision_idx ON nexus.publication_grants(revision_id);
CREATE TABLE nexus.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL, revision_id uuid NOT NULL,
  assessor_id uuid NOT NULL REFERENCES nexus.principals,
  method text NOT NULL CHECK(method IN ('source_review','contributor_test','artifact_review','independent_reproduction')),
  outcome text NOT NULL CHECK(outcome IN ('not_run','passed','failed','inconclusive')),
  environment jsonb NOT NULL DEFAULT '{}', note text NOT NULL CHECK(length(note)<=2000),
  affiliation text NOT NULL CHECK(length(affiliation)<=200), independence text NOT NULL DEFAULT 'not_claimed',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(record_id,revision_id) REFERENCES nexus.record_revisions(record_id,id)
);
CREATE INDEX assessments_revision_idx ON nexus.assessments(revision_id);
CREATE TABLE nexus.outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES nexus.principals,
  record_id uuid NOT NULL, revision_id uuid NOT NULL, outcome text NOT NULL CHECK(outcome IN ('not_run','passed','failed','inconclusive')),
  environment jsonb NOT NULL, note text NOT NULL CHECK(length(note)<=4000),
  method text NOT NULL DEFAULT 'contributor_test', self_reported boolean NOT NULL DEFAULT true CHECK(self_reported),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(record_id,revision_id) REFERENCES nexus.record_revisions(record_id,id)
);
CREATE INDEX outcomes_reporter_idx ON nexus.outcomes(reporter_id,created_at DESC);
CREATE TABLE nexus.idempotency (
  principal_id uuid NOT NULL REFERENCES nexus.principals, operation text NOT NULL,
  key text NOT NULL CHECK(length(key)<=100), body_digest text NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY(principal_id,operation,key)
);
CREATE TABLE nexus.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES nexus.principals,
  action text NOT NULL, record_id uuid REFERENCES nexus.records, revision_id uuid REFERENCES nexus.record_revisions,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_actor_idx ON nexus.audit_events(actor_id,created_at DESC);

CREATE FUNCTION nexus.actor() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('nexus.principal_id',true),'')::uuid
$$;
CREATE FUNCTION nexus.actor_owner() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT owner_id FROM nexus.principals WHERE id=nexus.actor()
$$;
CREATE FUNCTION nexus.is_human() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT kind='human' FROM nexus.principals WHERE id=nexus.actor()),false)
$$;
CREATE FUNCTION nexus.owns_record(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT owner_id=nexus.actor_owner() FROM nexus.records WHERE id=target),false)
$$;
CREATE FUNCTION nexus.can_review(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT nexus.is_human() AND (EXISTS(SELECT 1 FROM nexus.record_revisions v
    JOIN nexus.records r ON r.id=v.record_id WHERE v.id=target AND r.owner_id=nexus.actor_owner())
    OR EXISTS(SELECT 1 FROM nexus.review_assignments WHERE revision_id=target AND reviewer_id=nexus.actor()))
$$;
CREATE FUNCTION nexus.can_read_revision(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT nexus.actor() IS NOT NULL AND EXISTS (
    SELECT 1 FROM nexus.record_revisions v JOIN nexus.records r ON r.id=v.record_id WHERE v.id=target AND (
      r.owner_id=nexus.actor_owner() OR nexus.can_review(v.id) OR (
        r.state='published' AND EXISTS(SELECT 1 FROM nexus.publication_grants g
          WHERE g.revision_id=v.id AND g.revoked_at IS NULL AND g.digest=v.digest AND
            (g.visibility='public' OR (g.visibility='team' AND EXISTS(SELECT 1 FROM nexus.memberships m
              WHERE m.team_id=r.team_id AND m.owner_id=nexus.actor_owner())))))))
$$;
CREATE FUNCTION nexus.can_read_record(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM nexus.record_revisions v WHERE v.record_id=target AND nexus.can_read_revision(v.id))
    OR nexus.owns_record(target)
$$;
CREATE FUNCTION nexus.authenticate(hash text) RETURNS TABLE(id uuid,owner_id uuid,name text,kind text,role text,scopes text[])
  LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,p.owner_id,p.name,p.kind,p.role,c.scopes FROM nexus.credentials c
  JOIN nexus.principals p ON p.id=c.principal_id
  WHERE c.token_hash=hash AND c.kind IN ('agent','session') AND c.revoked_at IS NULL AND c.expires_at>now()
$$;
CREATE FUNCTION nexus.exchange_credential(old_hash text,new_hash text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c nexus.credentials;
BEGIN
  SELECT * INTO c FROM nexus.credentials WHERE token_hash=old_hash AND kind='exchange'
    AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE nexus.credentials SET revoked_at=clock_timestamp() WHERE id=c.id;
  INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at)
    VALUES(new_hash,c.principal_id,c.scopes,'session',now()+interval '12 hours');
  RETURN true;
END $$;
CREATE FUNCTION nexus.revoke_session(hash text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE nexus.credentials SET revoked_at=clock_timestamp() WHERE token_hash=hash AND kind='session'
$$;

CREATE FUNCTION nexus.guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted AND (NEW.content<>OLD.content OR NEW.digest<>OLD.digest OR NEW.record_id<>OLD.record_id
    OR NEW.sequence<>OLD.sequence OR NEW.submitted=false) THEN RAISE EXCEPTION 'immutable_revision'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE ON nexus.record_revisions FOR EACH ROW EXECUTE FUNCTION nexus.guard_revision();
CREATE FUNCTION nexus.guard_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v nexus.record_revisions; decision text;
BEGIN
  IF session_user='postgres' THEN RETURN NEW; END IF;
  IF NEW.owner_id<>OLD.owner_id OR NEW.origin_node<>OLD.origin_node THEN RAISE EXCEPTION 'immutable_owner'; END IF;
  IF session_user='nexus_worker' THEN
    IF OLD.state<>'quarantined' OR NEW.state NOT IN ('reviewable','rejected') OR NEW.current_revision_id<>OLD.current_revision_id
      OR NEW.visibility<>OLD.visibility THEN RAISE EXCEPTION 'worker_scope'; END IF;
    RETURN NEW;
  END IF;
  IF NOT nexus.owns_record(OLD.id) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NEW.state='withdrawn' AND NOT nexus.is_human() THEN RAISE EXCEPTION 'human_required'; END IF;
  IF NEW.state='published' THEN
    IF NOT nexus.is_human() THEN RAISE EXCEPTION 'human_required'; END IF;
    SELECT * INTO v FROM nexus.record_revisions WHERE id=NEW.current_revision_id AND record_id=NEW.id;
    SELECT d.decision INTO decision FROM nexus.review_decisions d WHERE d.revision_id=v.id AND d.digest=v.digest
      ORDER BY d.created_at DESC LIMIT 1;
    IF NOT v.submitted OR decision IS DISTINCT FROM 'approved' OR NOT EXISTS(
      SELECT 1 FROM nexus.review_jobs j WHERE j.revision_id=v.id AND j.state='done' AND j.result->>'blocked'='false'
    ) OR NOT EXISTS(SELECT 1 FROM nexus.publication_grants g WHERE g.revision_id=v.id AND g.digest=v.digest
      AND g.visibility=NEW.visibility AND g.owner_id=NEW.owner_id AND g.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'publication_precondition'; END IF;
  ELSIF NEW.state NOT IN ('draft','quarantined','withdrawn') THEN RAISE EXCEPTION 'invalid_transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_publication BEFORE UPDATE ON nexus.records FOR EACH ROW EXECUTE FUNCTION nexus.guard_record();

ALTER TABLE nexus.principals ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.principals FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_self ON nexus.principals USING (id=nexus.actor() OR id=nexus.actor_owner());
ALTER TABLE nexus.teams ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.teams FORCE ROW LEVEL SECURITY;
CREATE POLICY team_member ON nexus.teams USING (EXISTS(SELECT 1 FROM nexus.memberships m WHERE m.team_id=id AND m.owner_id=nexus.actor_owner()));
ALTER TABLE nexus.memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_self ON nexus.memberships USING(owner_id=nexus.actor_owner());
ALTER TABLE nexus.records ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.records FORCE ROW LEVEL SECURITY;
CREATE POLICY record_read ON nexus.records FOR SELECT USING(nexus.can_read_record(id));
CREATE POLICY record_insert ON nexus.records FOR INSERT WITH CHECK(owner_id=nexus.actor_owner() AND visibility='private' AND state='draft'
  AND (team_id IS NULL OR EXISTS(SELECT 1 FROM nexus.memberships m WHERE m.team_id=records.team_id AND m.owner_id=nexus.actor_owner())));
CREATE POLICY record_update ON nexus.records FOR UPDATE USING(nexus.owns_record(id)) WITH CHECK(owner_id=nexus.actor_owner());
ALTER TABLE nexus.record_revisions ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.record_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY revision_read ON nexus.record_revisions FOR SELECT USING(nexus.can_read_revision(id) OR nexus.owns_record(record_id));
CREATE POLICY revision_insert ON nexus.record_revisions FOR INSERT WITH CHECK(nexus.owns_record(record_id));
CREATE POLICY revision_update ON nexus.record_revisions FOR UPDATE USING(nexus.owns_record(record_id));
ALTER TABLE nexus.review_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.review_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY assignments_read ON nexus.review_assignments FOR SELECT USING(reviewer_id=nexus.actor() OR nexus.can_review(revision_id));
ALTER TABLE nexus.review_jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.review_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY job_read ON nexus.review_jobs FOR SELECT USING(nexus.can_review(revision_id) OR EXISTS(
  SELECT 1 FROM nexus.record_revisions v WHERE v.id=revision_id AND nexus.owns_record(v.record_id)));
CREATE POLICY job_insert ON nexus.review_jobs FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM nexus.record_revisions v WHERE v.id=revision_id AND nexus.owns_record(v.record_id)));
ALTER TABLE nexus.review_decisions ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.review_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_read ON nexus.review_decisions FOR SELECT USING(nexus.can_read_revision(revision_id));
CREATE POLICY decision_insert ON nexus.review_decisions FOR INSERT WITH CHECK(reviewer_id=nexus.actor() AND nexus.can_review(revision_id));
ALTER TABLE nexus.publication_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.publication_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY grant_read ON nexus.publication_grants FOR SELECT USING(owner_id=nexus.actor_owner());
CREATE POLICY grant_insert ON nexus.publication_grants FOR INSERT WITH CHECK(owner_id=nexus.actor_owner() AND nexus.is_human()
  AND EXISTS(SELECT 1 FROM nexus.record_revisions v WHERE v.id=revision_id AND nexus.owns_record(v.record_id)));
CREATE POLICY grant_update ON nexus.publication_grants FOR UPDATE USING(owner_id=nexus.actor_owner() AND nexus.is_human());
ALTER TABLE nexus.assessments ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY assessment_read ON nexus.assessments FOR SELECT USING(nexus.can_read_revision(revision_id));
CREATE POLICY assessment_insert ON nexus.assessments FOR INSERT WITH CHECK(assessor_id=nexus.actor() AND nexus.can_review(revision_id)
  AND (independence='not_claimed' OR (independence='declared_external_owner' AND NOT nexus.owns_record(record_id))));
ALTER TABLE nexus.outcomes ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY outcome_self ON nexus.outcomes FOR SELECT USING(reporter_id=nexus.actor());
CREATE POLICY outcome_insert ON nexus.outcomes FOR INSERT WITH CHECK(reporter_id=nexus.actor() AND nexus.can_read_revision(revision_id));
ALTER TABLE nexus.idempotency ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_self ON nexus.idempotency USING(principal_id=nexus.actor()) WITH CHECK(principal_id=nexus.actor());
ALTER TABLE nexus.audit_events ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_self ON nexus.audit_events USING(actor_id=nexus.actor()) WITH CHECK(actor_id=nexus.actor());

GRANT SELECT ON nexus.principals,nexus.teams,nexus.memberships,nexus.review_assignments TO nexus_app;
GRANT SELECT,INSERT,UPDATE ON nexus.records,nexus.record_revisions,nexus.publication_grants TO nexus_app;
GRANT SELECT,INSERT ON nexus.review_jobs,nexus.review_decisions,nexus.assessments,nexus.outcomes,nexus.idempotency,nexus.audit_events TO nexus_app;

CREATE FUNCTION nexus.claim_review_job() RETURNS TABLE(job_id uuid,lease_id uuid,revision_id uuid,content jsonb,digest text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; lease uuid;
BEGIN
  UPDATE nexus.review_jobs SET state='failed' WHERE attempts>=3 AND state='running' AND leased_until<now();
  SELECT j.id INTO target FROM nexus.review_jobs j WHERE j.attempts<3 AND
    (j.state='pending' OR (j.state='running' AND j.leased_until<now())) ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  lease:=gen_random_uuid();
  UPDATE nexus.review_jobs j SET state='running',attempts=j.attempts+1,lease_id=lease,leased_until=now()+interval '30 seconds' WHERE j.id=target;
  RETURN QUERY SELECT j.id,j.lease_id,v.id,v.content,v.digest FROM nexus.review_jobs j
    JOIN nexus.record_revisions v ON v.id=j.revision_id WHERE j.id=target;
END $$;
CREATE FUNCTION nexus.finish_review_job(target uuid,lease uuid,report jsonb) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE revision uuid;
BEGIN
  IF jsonb_typeof(report)<>'object' OR report->>'blocked' NOT IN ('true','false') OR report->>'policy_version'<>'screen-v1'
    OR octet_length(report::text)>4096 THEN RAISE EXCEPTION 'invalid_scan_report'; END IF;
  UPDATE nexus.review_jobs SET state='done',result=report,leased_until=NULL
    WHERE id=target AND lease_id=lease AND state='running' AND leased_until>=now() RETURNING revision_id INTO revision;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE nexus.records SET state=CASE WHEN report->>'blocked'='true' THEN 'rejected' ELSE 'reviewable' END
    WHERE current_revision_id=revision AND state='quarantined';
  RETURN true;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nexus FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.actor(),nexus.actor_owner(),nexus.is_human(),nexus.owns_record(uuid),nexus.can_review(uuid),
  nexus.can_read_revision(uuid),nexus.can_read_record(uuid),nexus.authenticate(text),nexus.exchange_credential(text,text),nexus.revoke_session(text) TO nexus_app;
GRANT EXECUTE ON FUNCTION nexus.claim_review_job(),nexus.finish_review_job(uuid,uuid,jsonb) TO nexus_worker;

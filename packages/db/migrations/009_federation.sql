-- A separate verifier role can refresh the public federation cache, but cannot
-- publish native records, approve imports, or read private outcomes.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexus_federation') THEN
    CREATE ROLE nexus_federation NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA nexus TO nexus_federation;

CREATE TABLE nexus.federation_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), node_id uuid UNIQUE NOT NULL,
  label text NOT NULL CHECK(length(label)<=100), key_id text NOT NULL CHECK(key_id ~ '^[a-f0-9]{64}$'),
  public_key text NOT NULL CHECK(length(public_key)<=2048), operator_id uuid NOT NULL REFERENCES nexus.principals
);
CREATE TABLE nexus.federation_peers (
  node_id uuid PRIMARY KEY, label text NOT NULL CHECK(length(label)<=100),
  endpoint text NOT NULL CHECK(endpoint ~ '^http://127[.]0[.]0[.]1:[0-9]{4,5}/?$'),
  key_id text NOT NULL CHECK(key_id ~ '^[a-f0-9]{64}$'), public_key text NOT NULL CHECK(length(public_key)<=2048),
  active boolean NOT NULL DEFAULT true, import_enabled boolean NOT NULL DEFAULT false,
  export_enabled boolean NOT NULL DEFAULT true, last_sequence bigint NOT NULL DEFAULT 0,
  last_success timestamptz, last_failure timestamptz
);
CREATE TABLE nexus.federation_exports (
  peer_id uuid REFERENCES nexus.federation_peers, record_id uuid REFERENCES nexus.records,
  revision_id uuid NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  owner_id uuid NOT NULL REFERENCES nexus.principals, enabled boolean NOT NULL,
  consent_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(peer_id,record_id),
  FOREIGN KEY(record_id,revision_id) REFERENCES nexus.record_revisions(record_id,id)
);
CREATE TABLE nexus.federation_nonces (
  peer_id uuid REFERENCES nexus.federation_peers, nonce uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds', PRIMARY KEY(peer_id,nonce)
);
CREATE SEQUENCE nexus.federation_serial;
CREATE TABLE nexus.federation_cache (
  peer_id uuid REFERENCES nexus.federation_peers, record_id uuid NOT NULL,
  revision_id uuid, revision_sequence integer, digest text, artifact_digest text,
  key_id text NOT NULL, state text NOT NULL CHECK(state IN ('active','unavailable')),
  payload jsonb, blocked boolean NOT NULL DEFAULT true, valid_until timestamptz NOT NULL,
  PRIMARY KEY(peer_id,record_id)
);
CREATE TABLE nexus.federation_approvals (
  peer_id uuid, record_id uuid, revision_id uuid NOT NULL, artifact_digest text NOT NULL,
  operator_id uuid NOT NULL REFERENCES nexus.principals, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(peer_id,record_id), FOREIGN KEY(peer_id,record_id) REFERENCES nexus.federation_cache
);
CREATE TABLE nexus.federation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES nexus.principals,
  action text NOT NULL CHECK(length(action)<=60), peer_id uuid, record_id uuid, revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX federation_events_actor_idx ON nexus.federation_events(actor_id,created_at DESC);
CREATE TABLE nexus.federation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES nexus.principals,
  peer_id uuid NOT NULL, record_id uuid NOT NULL, revision_id uuid NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('not_run','passed','failed','inconclusive')),
  environment jsonb NOT NULL CHECK(jsonb_typeof(environment)='object' AND octet_length(environment::text)<=4096),
  note text NOT NULL CHECK(length(note)<=4000), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 100),
  body_digest text NOT NULL CHECK(body_digest ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(reporter_id,idempotency_key)
);

CREATE FUNCTION nexus.fed_operator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT nexus.is_human() AND EXISTS(SELECT 1 FROM nexus.federation_identity WHERE operator_id=nexus.actor_owner())
$$;
CREATE FUNCTION nexus.fed_usable(peer uuid,record uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT nexus.actor() IS NOT NULL AND EXISTS(
    SELECT 1 FROM nexus.federation_cache c JOIN nexus.federation_peers p ON p.node_id=c.peer_id
    JOIN nexus.federation_approvals a ON a.peer_id=c.peer_id AND a.record_id=c.record_id
    WHERE c.peer_id=peer AND c.record_id=record AND c.state='active' AND NOT c.blocked
      AND c.payload IS NOT NULL AND c.valid_until>clock_timestamp() AND p.active AND p.import_enabled
      AND c.key_id=p.key_id AND a.revision_id=c.revision_id AND a.artifact_digest=c.artifact_digest)
$$;
ALTER TABLE nexus.federation_identity ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_identity_read ON nexus.federation_identity FOR SELECT USING(nexus.actor() IS NOT NULL);
ALTER TABLE nexus.federation_peers ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_peers FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_peers_read ON nexus.federation_peers FOR SELECT USING(nexus.actor() IS NOT NULL);
CREATE POLICY federation_peers_update ON nexus.federation_peers FOR UPDATE USING(nexus.fed_operator()) WITH CHECK(nexus.fed_operator());
ALTER TABLE nexus.federation_exports ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_exports_read ON nexus.federation_exports FOR SELECT USING(owner_id=nexus.actor_owner());
ALTER TABLE nexus.federation_nonces ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_nonces FORCE ROW LEVEL SECURITY;
ALTER TABLE nexus.federation_cache ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_cache_read ON nexus.federation_cache FOR SELECT USING(nexus.fed_operator() OR nexus.fed_usable(peer_id,record_id));
ALTER TABLE nexus.federation_approvals ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_approvals_read ON nexus.federation_approvals FOR SELECT USING(nexus.fed_operator() OR nexus.fed_usable(peer_id,record_id));
ALTER TABLE nexus.federation_events ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_events_read ON nexus.federation_events FOR SELECT USING(nexus.owns_principal(actor_id));
ALTER TABLE nexus.federation_outcomes ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.federation_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY federation_outcomes_read ON nexus.federation_outcomes FOR SELECT USING(nexus.owns_principal(reporter_id));
GRANT SELECT ON nexus.federation_identity,nexus.federation_peers,nexus.federation_exports,
  nexus.federation_cache,nexus.federation_approvals,nexus.federation_events,nexus.federation_outcomes TO nexus_app;
GRANT UPDATE(import_enabled,export_enabled) ON nexus.federation_peers TO nexus_app;

CREATE FUNCTION nexus.fed_peer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.key_id<>OLD.key_id OR NOT NEW.active OR NOT NEW.import_enabled THEN
    DELETE FROM nexus.federation_approvals WHERE peer_id=NEW.node_id;
    UPDATE nexus.federation_cache SET state='unavailable',payload=NULL,valid_until=clock_timestamp() WHERE peer_id=NEW.node_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER federation_peer_change AFTER UPDATE ON nexus.federation_peers FOR EACH ROW EXECUTE FUNCTION nexus.fed_peer_guard();

CREATE FUNCTION nexus.fed_export_grant(record uuid,revision uuid,hash text,peer uuid,enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r nexus.records; v nexus.record_revisions;
BEGIN
  SELECT * INTO r FROM nexus.records WHERE id=record FOR UPDATE;
  IF NOT nexus.is_human() OR r.id IS NULL OR r.owner_id IS DISTINCT FROM nexus.actor_owner() THEN RAISE EXCEPTION 'owner_required'; END IF;
  PERFORM 1 FROM nexus.federation_peers WHERE node_id=peer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  IF enabled THEN
    SELECT * INTO v FROM nexus.record_revisions WHERE id=revision AND record_id=record;
    IF r.state<>'published' OR r.visibility<>'public' OR r.current_revision_id<>revision OR v.digest IS DISTINCT FROM hash
      OR NOT EXISTS(SELECT 1 FROM nexus.federation_peers WHERE node_id=peer AND active AND export_enabled)
      OR NOT EXISTS(SELECT 1 FROM nexus.publication_grants WHERE revision_id=revision AND digest=hash AND visibility='public' AND revoked_at IS NULL)
      THEN RAISE EXCEPTION 'public_revision_required'; END IF;
    IF (SELECT count(*) FROM nexus.federation_exports WHERE peer_id=peer AND federation_exports.enabled AND record_id<>record)>=100 THEN RAISE EXCEPTION 'export_limit'; END IF;
  END IF;
  INSERT INTO nexus.federation_exports(peer_id,record_id,revision_id,digest,owner_id,enabled)
    VALUES(peer,record,revision,hash,r.owner_id,enabled) ON CONFLICT(peer_id,record_id) DO UPDATE
      SET revision_id=EXCLUDED.revision_id,digest=EXCLUDED.digest,enabled=EXCLUDED.enabled,consent_at=clock_timestamp();
  INSERT INTO nexus.federation_events(actor_id,action,peer_id,record_id,revision_id) VALUES(nexus.actor(),'export_consent',peer,record,revision);
END $$;
CREATE FUNCTION nexus.fed_accept_nonce(peer uuid,key text,request_nonce uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM nexus.federation_peers WHERE node_id=peer AND active AND key_id=key) THEN RETURN false; END IF;
  DELETE FROM nexus.federation_nonces WHERE ctid IN (SELECT ctid FROM nexus.federation_nonces WHERE expires_at<clock_timestamp() LIMIT 1000);
  INSERT INTO nexus.federation_nonces(peer_id,nonce) VALUES(peer,request_nonce) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
CREATE FUNCTION nexus.fed_export_snapshot(peer uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('sequence',nextval('nexus.federation_serial'),'items',coalesce(jsonb_agg(
    CASE WHEN e.enabled AND p.active AND p.export_enabled AND r.state='published' AND r.visibility='public'
      AND r.current_revision_id=e.revision_id AND v.digest=e.digest
      AND EXISTS(SELECT 1 FROM nexus.publication_grants g WHERE g.revision_id=v.id AND g.digest=v.digest AND g.visibility='public' AND g.revoked_at IS NULL)
    THEN jsonb_build_object('state','active','record_id',r.id,'revision_id',v.id,'sequence',v.sequence,'digest',v.digest,
      'content',v.content-'intended_visibility','evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('method',a.method,'outcome',a.outcome,'count',a.n))
        FROM (SELECT method,outcome,count(*)::integer AS n FROM nexus.assessments WHERE revision_id=v.id GROUP BY method,outcome ORDER BY method,outcome) a),'[]'::jsonb))
    ELSE jsonb_build_object('state','unavailable','record_id',r.id) END ORDER BY r.id),'[]'::jsonb))
  FROM nexus.federation_exports e JOIN nexus.federation_peers p ON p.node_id=e.peer_id
    JOIN nexus.records r ON r.id=e.record_id JOIN nexus.record_revisions v ON v.id=e.revision_id WHERE e.peer_id=peer AND e.enabled
$$;
CREATE FUNCTION nexus.fed_approve(peer uuid,record uuid,revision uuid,hash text,accepted boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT nexus.fed_operator() THEN RAISE EXCEPTION 'operator_required'; END IF;
  IF accepted THEN
    PERFORM 1 FROM nexus.federation_cache c JOIN nexus.federation_peers p ON p.node_id=c.peer_id
      WHERE c.peer_id=peer AND c.record_id=record AND c.revision_id=revision AND c.artifact_digest=hash
      AND c.state='active' AND NOT c.blocked AND c.payload IS NOT NULL AND c.valid_until>clock_timestamp()
      AND p.active AND p.import_enabled AND c.key_id=p.key_id FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'fresh_revision_required'; END IF;
    INSERT INTO nexus.federation_approvals(peer_id,record_id,revision_id,artifact_digest,operator_id) VALUES(peer,record,revision,hash,nexus.actor_owner())
      ON CONFLICT(peer_id,record_id) DO UPDATE SET revision_id=EXCLUDED.revision_id,artifact_digest=EXCLUDED.artifact_digest,operator_id=EXCLUDED.operator_id,created_at=clock_timestamp();
  ELSE
    DELETE FROM nexus.federation_approvals WHERE peer_id=peer AND record_id=record;
  END IF;
  INSERT INTO nexus.federation_events(actor_id,action,peer_id,record_id,revision_id) VALUES(nexus.actor(),CASE WHEN accepted THEN 'import_approved' ELSE 'import_revoked' END,peer,record,revision);
END $$;
CREATE FUNCTION nexus.fed_worker_peers() RETURNS SETOF nexus.federation_peers LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT * FROM nexus.federation_peers WHERE active AND import_enabled ORDER BY node_id LIMIT 16
$$;
CREATE FUNCTION nexus.fed_worker_identity() RETURNS SETOF nexus.federation_identity LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT * FROM nexus.federation_identity
$$;
CREATE FUNCTION nexus.fed_log(peer uuid,record uuid,revision uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF nexus.actor() IS NULL OR nexus.actor()='00000000-0000-4000-8000-000000000000'::uuid THEN RETURN; END IF;
  IF NOT nexus.fed_usable(peer,record) THEN RAISE EXCEPTION 'unavailable'; END IF;
  INSERT INTO nexus.federation_events(actor_id,action,peer_id,record_id,revision_id) VALUES(nexus.actor(),'federated_retrieved',peer,record,revision);
END $$;
CREATE FUNCTION nexus.fed_outcome(peer uuid,record uuid,revision uuid,result text,environment jsonb,note text,idem text,hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior nexus.federation_outcomes; saved uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM nexus.principals WHERE id=nexus.actor() AND kind IN ('human','agent')) THEN RAISE EXCEPTION 'actor_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(nexus.actor()::text||':fed-outcome:'||idem,0));
  SELECT * INTO prior FROM nexus.federation_outcomes WHERE reporter_id=nexus.actor() AND idempotency_key=idem;
  IF prior.id IS NOT NULL THEN
    IF prior.body_digest<>hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id',prior.id,'visibility','private','self_reported',true,'demo',true);
  END IF;
  IF NOT nexus.fed_usable(peer,record) OR NOT EXISTS(SELECT 1 FROM nexus.federation_cache WHERE peer_id=peer AND record_id=record AND revision_id=revision) THEN RAISE EXCEPTION 'fresh_revision_required'; END IF;
  INSERT INTO nexus.federation_outcomes(reporter_id,peer_id,record_id,revision_id,outcome,environment,note,idempotency_key,body_digest)
    VALUES(nexus.actor(),peer,record,revision,result,environment,note,idem,hash) RETURNING id INTO saved;
  INSERT INTO nexus.federation_events(actor_id,action,peer_id,record_id,revision_id) VALUES(nexus.actor(),'federated_outcome_reported',peer,record,revision);
  RETURN jsonb_build_object('id',saved,'visibility','private','self_reported',true,'demo',true);
END $$;
CREATE FUNCTION nexus.fed_invalidate(peer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM nexus.federation_approvals WHERE peer_id=peer;
  UPDATE nexus.federation_cache SET payload=NULL,state='unavailable',valid_until=clock_timestamp() WHERE peer_id=peer;
  UPDATE nexus.federation_peers SET last_failure=clock_timestamp() WHERE node_id=peer;
END $$;
CREATE FUNCTION nexus.fed_apply(peer uuid,key text,serial bigint,expires timestamptz,items jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p nexus.federation_peers; item jsonb; rid uuid; old nexus.federation_cache; present uuid[]:=ARRAY[]::uuid[];
BEGIN
  SELECT * INTO p FROM nexus.federation_peers WHERE node_id=peer FOR UPDATE;
  IF p.node_id IS NULL OR NOT p.active OR NOT p.import_enabled OR p.key_id<>key THEN RAISE EXCEPTION 'peer_unavailable'; END IF;
  IF serial<=p.last_sequence THEN RETURN false; END IF;
  IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '31 seconds' OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>100 OR octet_length(items::text)>1048576 THEN RAISE EXCEPTION 'invalid_snapshot'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    rid:=(item->>'record_id')::uuid;
    IF rid=ANY(present) THEN RAISE EXCEPTION 'duplicate_record'; END IF;
    present:=array_append(present,rid);
    SELECT * INTO old FROM nexus.federation_cache WHERE peer_id=peer AND record_id=rid;
    IF item->>'state'='active' THEN
      IF old.revision_sequence>(item->>'sequence')::integer OR (old.revision_sequence=(item->>'sequence')::integer AND (old.revision_id<>(item->>'revision_id')::uuid OR old.digest<>item->>'digest')) THEN RAISE EXCEPTION 'revision_rollback'; END IF;
      IF old.artifact_digest IS DISTINCT FROM item->>'artifact_digest' OR old.state IS DISTINCT FROM 'active' OR old.key_id IS DISTINCT FROM key THEN
        DELETE FROM nexus.federation_approvals WHERE peer_id=peer AND record_id=rid;
      END IF;
      INSERT INTO nexus.federation_cache(peer_id,record_id,revision_id,revision_sequence,digest,artifact_digest,key_id,state,payload,blocked,valid_until)
        VALUES(peer,rid,(item->>'revision_id')::uuid,(item->>'sequence')::integer,item->>'digest',item->>'artifact_digest',key,'active',item-'artifact_digest'-'blocked',(item->>'blocked')::boolean,expires)
        ON CONFLICT(peer_id,record_id) DO UPDATE SET revision_id=EXCLUDED.revision_id,revision_sequence=EXCLUDED.revision_sequence,digest=EXCLUDED.digest,
          artifact_digest=EXCLUDED.artifact_digest,key_id=EXCLUDED.key_id,state='active',payload=EXCLUDED.payload,blocked=EXCLUDED.blocked,valid_until=EXCLUDED.valid_until;
    ELSIF item->>'state'='unavailable' THEN
      DELETE FROM nexus.federation_approvals WHERE peer_id=peer AND record_id=rid;
      UPDATE nexus.federation_cache SET state='unavailable',payload=NULL,valid_until=expires WHERE peer_id=peer AND record_id=rid;
    ELSE RAISE EXCEPTION 'invalid_item'; END IF;
  END LOOP;
  DELETE FROM nexus.federation_approvals WHERE peer_id=peer AND NOT(record_id=ANY(present));
  UPDATE nexus.federation_cache SET state='unavailable',payload=NULL,valid_until=expires WHERE peer_id=peer AND NOT(record_id=ANY(present));
  UPDATE nexus.federation_peers SET last_sequence=serial,last_success=clock_timestamp() WHERE node_id=peer;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION nexus.fed_operator(),nexus.fed_usable(uuid,uuid),nexus.fed_peer_guard(),
  nexus.fed_export_grant(uuid,uuid,text,uuid,boolean),nexus.fed_accept_nonce(uuid,text,uuid),nexus.fed_export_snapshot(uuid),
  nexus.fed_approve(uuid,uuid,uuid,text,boolean),nexus.fed_log(uuid,uuid,uuid),nexus.fed_outcome(uuid,uuid,uuid,text,jsonb,text,text,text),nexus.fed_worker_peers(),nexus.fed_worker_identity(),nexus.fed_invalidate(uuid),nexus.fed_apply(uuid,text,bigint,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.fed_operator(),nexus.fed_usable(uuid,uuid),nexus.fed_export_grant(uuid,uuid,text,uuid,boolean),
  nexus.fed_accept_nonce(uuid,text,uuid),nexus.fed_export_snapshot(uuid),nexus.fed_approve(uuid,uuid,uuid,text,boolean),nexus.fed_log(uuid,uuid,uuid),nexus.fed_outcome(uuid,uuid,uuid,text,jsonb,text,text,text) TO nexus_app;
GRANT EXECUTE ON FUNCTION nexus.fed_worker_peers(),nexus.fed_worker_identity(),nexus.fed_invalidate(uuid),nexus.fed_apply(uuid,text,bigint,timestamptz,jsonb) TO nexus_federation;

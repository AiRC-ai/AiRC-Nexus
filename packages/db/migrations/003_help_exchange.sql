CREATE TABLE nexus.help_participants (
  owner_id uuid PRIMARY KEY REFERENCES nexus.principals, label text NOT NULL, opted_in boolean NOT NULL DEFAULT false
);
CREATE TABLE nexus.help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES nexus.principals,
  creator_id uuid NOT NULL REFERENCES nexus.principals, question text NOT NULL CHECK(length(question)<=4000),
  environment jsonb NOT NULL, digest text NOT NULL, screening jsonb NOT NULL,
  state text NOT NULL DEFAULT 'private' CHECK(state IN ('private','shared','closed')),
  recipient_owner_id uuid REFERENCES nexus.help_participants, approved_digest text,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX help_owner_idx ON nexus.help_requests(owner_id,created_at DESC);
CREATE INDEX help_recipient_idx ON nexus.help_requests(recipient_owner_id,state,expires_at);
CREATE TABLE nexus.help_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES nexus.help_requests,
  owner_id uuid NOT NULL REFERENCES nexus.principals, creator_id uuid NOT NULL REFERENCES nexus.principals,
  content jsonb NOT NULL, digest text NOT NULL, screening jsonb NOT NULL,
  shared boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX help_replies_request_idx ON nexus.help_replies(request_id,created_at);
CREATE FUNCTION nexus.can_read_help(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM nexus.help_requests h WHERE h.id=target AND (h.owner_id=nexus.actor_owner()
    OR (h.recipient_owner_id=nexus.actor_owner() AND h.state='shared' AND h.expires_at>now())))
$$;
CREATE FUNCTION nexus.can_reply_help(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM nexus.help_requests h WHERE h.id=target AND h.recipient_owner_id=nexus.actor_owner()
    AND h.state='shared' AND h.expires_at>now())
$$;
CREATE FUNCTION nexus.can_read_reply(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM nexus.help_replies r JOIN nexus.help_requests h ON h.id=r.request_id WHERE r.id=target
    AND (r.owner_id=nexus.actor_owner() OR (r.shared AND h.owner_id=nexus.actor_owner())))
$$;
CREATE FUNCTION nexus.guard_help_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id<>OLD.owner_id OR NEW.creator_id<>OLD.creator_id OR NEW.question<>OLD.question
    OR NEW.environment<>OLD.environment OR NEW.digest<>OLD.digest OR NEW.screening<>OLD.screening OR NEW.expires_at<>OLD.expires_at
    THEN RAISE EXCEPTION 'immutable_help_request'; END IF;
  IF NOT nexus.is_human() OR NEW.owner_id<>nexus.actor_owner() THEN RAISE EXCEPTION 'human_owner_required'; END IF;
  IF NEW.state='shared' THEN
    IF OLD.state<>'private' OR NEW.approved_digest IS DISTINCT FROM OLD.digest OR OLD.screening->>'blocked' IS DISTINCT FROM 'false'
      OR NEW.recipient_owner_id IS NULL OR NEW.recipient_owner_id=NEW.owner_id OR NEW.expires_at<=now()
      OR NOT EXISTS(SELECT 1 FROM nexus.help_participants p WHERE p.owner_id=NEW.recipient_owner_id AND p.opted_in)
      THEN RAISE EXCEPTION 'help_sharing_precondition'; END IF;
  ELSIF NEW.state<>'closed' THEN RAISE EXCEPTION 'invalid_help_transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_help_sharing BEFORE UPDATE ON nexus.help_requests FOR EACH ROW EXECUTE FUNCTION nexus.guard_help_request();
CREATE FUNCTION nexus.guard_help_reply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id<>OLD.request_id OR NEW.owner_id<>OLD.owner_id OR NEW.creator_id<>OLD.creator_id OR NEW.content<>OLD.content
    OR NEW.digest<>OLD.digest OR NEW.screening<>OLD.screening THEN RAISE EXCEPTION 'immutable_help_reply'; END IF;
  IF NOT nexus.is_human() OR NEW.owner_id<>nexus.actor_owner() OR (NEW.shared AND
    (NEW.screening->>'blocked' IS DISTINCT FROM 'false' OR NOT nexus.can_reply_help(NEW.request_id)))
    THEN RAISE EXCEPTION 'reply_sharing_precondition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_reply_sharing BEFORE UPDATE ON nexus.help_replies FOR EACH ROW EXECUTE FUNCTION nexus.guard_help_reply();
ALTER TABLE nexus.help_participants ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.help_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY participants_read ON nexus.help_participants FOR SELECT USING(nexus.is_human() AND opted_in);
ALTER TABLE nexus.help_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.help_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY help_read ON nexus.help_requests FOR SELECT USING(nexus.can_read_help(id));
CREATE POLICY help_insert ON nexus.help_requests FOR INSERT WITH CHECK(owner_id=nexus.actor_owner() AND creator_id=nexus.actor()
  AND state='private' AND recipient_owner_id IS NULL AND approved_digest IS NULL);
CREATE POLICY help_update ON nexus.help_requests FOR UPDATE USING(owner_id=nexus.actor_owner() AND nexus.is_human());
ALTER TABLE nexus.help_replies ENABLE ROW LEVEL SECURITY; ALTER TABLE nexus.help_replies FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_read ON nexus.help_replies FOR SELECT USING(nexus.can_read_reply(id));
CREATE POLICY reply_insert ON nexus.help_replies FOR INSERT WITH CHECK(owner_id=nexus.actor_owner() AND creator_id=nexus.actor()
  AND shared=false AND nexus.can_reply_help(request_id));
CREATE POLICY reply_update ON nexus.help_replies FOR UPDATE USING(owner_id=nexus.actor_owner() AND nexus.is_human());
GRANT SELECT ON nexus.help_participants TO nexus_app;
GRANT SELECT,INSERT,UPDATE ON nexus.help_requests,nexus.help_replies TO nexus_app;
REVOKE ALL ON FUNCTION nexus.can_read_help(uuid),nexus.can_reply_help(uuid),nexus.can_read_reply(uuid),nexus.guard_help_request(),nexus.guard_help_reply() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.can_read_help(uuid),nexus.can_reply_help(uuid),nexus.can_read_reply(uuid) TO nexus_app;

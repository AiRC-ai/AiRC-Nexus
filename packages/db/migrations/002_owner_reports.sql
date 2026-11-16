CREATE FUNCTION nexus.owns_principal(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target=nexus.actor() OR (nexus.is_human() AND EXISTS(
    SELECT 1 FROM nexus.principals p WHERE p.id=target AND p.owner_id=nexus.actor_owner()))
$$;
REVOKE ALL ON FUNCTION nexus.owns_principal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.owns_principal(uuid) TO nexus_app;
DROP POLICY outcome_self ON nexus.outcomes;
CREATE POLICY outcome_self ON nexus.outcomes FOR SELECT USING(nexus.owns_principal(reporter_id));
DROP POLICY audit_self ON nexus.audit_events;
CREATE POLICY audit_read ON nexus.audit_events FOR SELECT USING(nexus.owns_principal(actor_id));
CREATE POLICY audit_insert ON nexus.audit_events FOR INSERT WITH CHECK(actor_id=nexus.actor());

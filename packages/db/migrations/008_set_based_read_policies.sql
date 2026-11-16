-- Compute the authorized ID relation once per statement, instead of recursively
-- looking up the same owner, revision and grant for every candidate row.
-- The predicate preserves 001's owner/reviewer/public/team semantics.
CREATE FUNCTION nexus.readable_revision_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH viewer AS MATERIALIZED (
    SELECT id,owner_id,kind FROM nexus.principals WHERE id=(SELECT nexus.actor())
  )
  SELECT v.id FROM nexus.record_revisions v JOIN nexus.records r ON r.id=v.record_id CROSS JOIN viewer a
  WHERE r.owner_id=a.owner_id
    OR (a.kind='human' AND EXISTS(SELECT 1 FROM nexus.review_assignments x WHERE x.revision_id=v.id AND x.reviewer_id=a.id))
    OR (r.state='published' AND EXISTS(
      SELECT 1 FROM nexus.publication_grants g WHERE g.revision_id=v.id AND g.revoked_at IS NULL AND g.digest=v.digest
        AND (g.visibility='public' OR (g.visibility='team' AND EXISTS(
          SELECT 1 FROM nexus.memberships m WHERE m.team_id=r.team_id AND m.owner_id=a.owner_id)))))
$$;
CREATE FUNCTION nexus.readable_record_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT v.record_id FROM nexus.record_revisions v WHERE v.id IN (SELECT nexus.readable_revision_ids())
$$;
REVOKE ALL ON FUNCTION nexus.readable_revision_ids(),nexus.readable_record_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.readable_revision_ids(),nexus.readable_record_ids() TO nexus_app;

ALTER POLICY record_read ON nexus.records USING (
  owner_id=(SELECT nexus.actor_owner()) OR id IN (SELECT nexus.readable_record_ids())
);
ALTER POLICY revision_read ON nexus.record_revisions USING (
  id IN (SELECT nexus.readable_revision_ids()) OR nexus.owns_record(record_id)
);
ALTER POLICY assessment_read ON nexus.assessments USING (revision_id IN (SELECT nexus.readable_revision_ids()));
ALTER POLICY decision_read ON nexus.review_decisions USING (revision_id IN (SELECT nexus.readable_revision_ids()));

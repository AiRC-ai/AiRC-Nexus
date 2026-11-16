CREATE FUNCTION nexus.help_actor_kind(target uuid,is_reply boolean) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.kind FROM nexus.principals p JOIN nexus.help_requests h ON h.creator_id=p.id
    WHERE NOT is_reply AND h.id=target AND nexus.can_read_help(h.id)
  UNION ALL
  SELECT p.kind FROM nexus.principals p JOIN nexus.help_replies r ON r.creator_id=p.id
    WHERE is_reply AND r.id=target AND nexus.can_read_reply(r.id)
$$;
REVOKE ALL ON FUNCTION nexus.help_actor_kind(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.help_actor_kind(uuid,boolean) TO nexus_app;

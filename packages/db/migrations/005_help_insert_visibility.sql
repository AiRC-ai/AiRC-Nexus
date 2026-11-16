-- RETURNING must recognize the inserting owner's row without a recursive lookup.
DROP POLICY help_read ON nexus.help_requests;
CREATE POLICY help_read ON nexus.help_requests FOR SELECT USING(owner_id=nexus.actor_owner() OR nexus.can_read_help(id));
DROP POLICY reply_read ON nexus.help_replies;
CREATE POLICY reply_read ON nexus.help_replies FOR SELECT USING(owner_id=nexus.actor_owner() OR nexus.can_read_reply(id));

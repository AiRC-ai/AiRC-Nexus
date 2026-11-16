CREATE OR REPLACE FUNCTION nexus.finish_review_job(target uuid,lease uuid,report jsonb) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE revision uuid;
BEGIN
  IF jsonb_typeof(report) IS DISTINCT FROM 'object' OR report->>'blocked' IS NULL OR report->>'blocked' NOT IN ('true','false')
    OR report->>'policy_version' IS DISTINCT FROM 'screen-v1' OR jsonb_typeof(report->'reasons') IS DISTINCT FROM 'array'
    OR octet_length(report::text)>4096 THEN RAISE EXCEPTION 'invalid_scan_report'; END IF;
  UPDATE nexus.review_jobs SET state='done',result=report,leased_until=NULL
    WHERE id=target AND lease_id=lease AND state='running' AND leased_until>=now() RETURNING revision_id INTO revision;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE nexus.records SET state=CASE WHEN report->>'blocked'='true' THEN 'rejected' ELSE 'reviewable' END
    WHERE current_revision_id=revision AND state='quarantined';
  RETURN true;
END $$;

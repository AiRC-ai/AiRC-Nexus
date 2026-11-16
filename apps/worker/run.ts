import type { Pool } from '../../packages/db/index.js';
import { screen } from '../../packages/core/screen.js';

export async function runReviewJob(pool: Pool) {
  const { rows } = await pool.query('SELECT * FROM nexus.claim_review_job()');
  const job = rows[0];
  if (!job) return false;
  const report = screen(job.content);
  const finished = await pool.query('SELECT nexus.finish_review_job($1,$2,$3) AS accepted', [
    job.job_id,
    job.lease_id,
    JSON.stringify(report),
  ]);
  return Boolean(finished.rows[0].accepted);
}

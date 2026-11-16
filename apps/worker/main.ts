import { createPool } from '../../packages/db/index.js';
import { loadConfig } from '../../packages/core/config.js';
import { runReviewJob } from './run.js';
const pool = createPool((await loadConfig()).worker_url);
let stopped = false;
let failureReported = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopped = true;
  });
while (!stopped) {
  try {
    const worked = await runReviewJob(pool);
    failureReported = false;
    if (worked) continue;
  } catch {
    if (!failureReported)
      console.error('nexus_worker: bounded job failure; no approval was issued');
    failureReported = true;
  }
  await new Promise((r) => setTimeout(r, 500));
}
await pool.end();

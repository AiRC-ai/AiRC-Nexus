import { createPool } from '../../packages/db/index.js';
import { loadConfig } from '../../packages/core/config.js';
import { runReviewJob } from './run.js';
const pool = createPool((await loadConfig()).worker_url);
let stopped = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopped = true;
  });
while (!stopped) {
  try {
    if (await runReviewJob(pool)) continue;
  } catch {
    console.error('nexus_worker: bounded job failure; no approval was issued');
  }
  await new Promise((r) => setTimeout(r, 500));
}
await pool.end();

import { createPool } from '../../packages/db/index.js';
import { loadConfig } from '../../packages/core/config.js';
import { loadIdentity } from '../../packages/federation/protocol.js';
import { syncAll } from '../../packages/federation/sync.js';

const path = process.env.NEXUS_FEDERATION_IDENTITY;
if (!path) throw new Error('federation_identity_required');
const identity = await loadIdentity(path),
  pool = createPool((await loadConfig()).federation_url);
let stopped = false,
  reported = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopped = true;
  });
while (!stopped) {
  try {
    await syncAll(pool, identity);
    reported = false;
  } catch {
    if (!reported) console.error('nexus_federation: sync unavailable; no freshness was extended');
    reported = true;
  }
  for (let i = 0; i < 10 && !stopped; i++) await new Promise((r) => setTimeout(r, 500));
}
await pool.end();

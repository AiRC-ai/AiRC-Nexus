import { createPool } from '../../packages/db/index.js';
import { loadConfig } from '../../packages/core/config.js';
import { buildApp } from './app.js';
const config = await loadConfig();
const pool = createPool(config.app_url);
const app = await buildApp(pool, { port: config.port });
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void app.close().then(() => pool.end());
  });
const host = process.env.NEXUS_LISTEN_HOST ?? '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('invalid_listen_host');
await app.listen({ host, port: config.port });
console.log(`AiRC Nexus local prototype: http://127.0.0.1:${config.port}`);

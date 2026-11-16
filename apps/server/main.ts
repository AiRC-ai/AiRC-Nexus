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
await app.listen({ host: '127.0.0.1', port: config.port });
console.log(`AiRC Nexus local prototype: http://127.0.0.1:${config.port}`);

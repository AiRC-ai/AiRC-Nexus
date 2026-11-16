import { createPool, authenticate, type Pool } from '../../packages/db/index.js';
import { loadConfig } from '../../packages/core/config.js';
import { seed, type Access } from '../../scripts/seed.js';
import { Store } from '../../packages/core/store.js';
import { migrate } from '../../scripts/migrate.js';
import { randomBytes } from 'node:crypto';

export async function testContext(options: { accessPath?: string; records?: boolean } = {}) {
  const config = await loadConfig();
  const management = createPool(config.admin_url);
  const database = `nexus_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  await management.query(`CREATE DATABASE ${database}`);
  const url = (value: string) => {
    const parsed = new URL(value);
    parsed.pathname = '/' + database;
    return parsed.toString();
  };
  const admin = createPool(url(config.admin_url)),
    app = createPool(url(config.app_url)),
    worker = createPool(url(config.worker_url)),
    federation = createPool(url(config.federation_url));
  await migrate(admin);
  const access = await seed(admin, options);
  const alice = await authenticate(app, access.alice_agent),
    bob = await authenticate(app, access.bob_agent);
  if (!alice || !bob) throw new Error('Fixture authentication failed');
  const owner = {
    id: alice.owner_id,
    owner_id: alice.owner_id,
    name: 'Demo owner',
    kind: 'human' as const,
    role: 'owner' as const,
    scopes: ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw'],
  };
  return {
    config,
    admin,
    app,
    worker,
    federation,
    access,
    alice,
    bob,
    owner,
    store: new Store(app),
    close: async () => {
      await Promise.all([admin.end(), app.end(), worker.end(), federation.end()]);
      await management.query(`DROP DATABASE ${database} WITH (FORCE)`);
      await management.end();
    },
  };
}

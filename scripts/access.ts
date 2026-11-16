import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../packages/core/config.js';
import { createPool, tokenHash } from '../packages/db/index.js';
import { IDS } from '../fixtures/records.js';
import type { Access } from './seed.js';

const config = await loadConfig();
const access = JSON.parse(await readFile('.nexus/access.json', 'utf8')) as Access;
if (process.argv.includes('--renew')) {
  const pool = createPool(config.admin_url);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const [key, id, scopes] of [
      ['owner', IDS.alice, ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw']],
      ['bob', IDS.bob, ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw']],
      ['reviewer', IDS.reviewer, ['read', 'review']],
    ] as const) {
      access[key] = `nexus_login_${randomBytes(24).toString('hex')}`;
      await db.query(
        "UPDATE nexus.credentials SET revoked_at=clock_timestamp() WHERE principal_id=$1 AND kind='exchange'",
        [id],
      );
      await db.query(
        "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'exchange',now()+interval '7 days')",
        [tokenHash(access[key]), id, scopes],
      );
    }
    for (const [key, id] of [
      ['alice_agent', IDS.aliceAgent],
      ['bob_agent', IDS.bobAgent],
    ] as const) {
      access[key] = `nexus_agent_${randomBytes(24).toString('hex')}`;
      await db.query(
        "UPDATE nexus.credentials SET revoked_at=clock_timestamp() WHERE principal_id=$1 AND kind='agent'",
        [id],
      );
      await db.query(
        "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'agent',now()+interval '7 days')",
        [tokenHash(access[key]), id, ['read', 'draft', 'outcome']],
      );
    }
    await writeFile('.nexus/access.json', JSON.stringify(access, null, 2) + '\n', { mode: 0o600 });
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}
await mkdir('.nexus/secrets', { recursive: true, mode: 0o700 });
const pinned = resolve('.nexus/runtime/node-v24.22.3-darwin-arm64/bin/node');
const clients: Record<string, unknown> = {};
for (const [name, key] of [
  ['alex', 'alice_agent'],
  ['morgan', 'bob_agent'],
] as const) {
  const tokenFile = resolve(`.nexus/secrets/${name}-agent.token`);
  await writeFile(tokenFile, access[key], { mode: 0o600 });
  clients[`nexus-${name}`] = {
    command: existsSync(pinned) ? pinned : process.execPath,
    args: [resolve('dist/apps/mcp/main.js')],
    env: { NEXUS_URL: `http://127.0.0.1:${config.port}`, NEXUS_TOKEN_FILE: tokenFile },
  };
}
await writeFile('.nexus/mcp-config.json', JSON.stringify({ mcpServers: clients }, null, 2) + '\n', {
  mode: 0o600,
});
console.log(
  'Prepared local MCP configurations in .nexus/mcp-config.json; tokens stay in private files. Human sign-in codes are in .nexus/access.json. No host configuration was changed.',
);

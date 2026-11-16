import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootstrap } from './bootstrap.js';
import { seed } from './seed.js';
import { createPool } from '../packages/db/index.js';
import { createIdentity, loadIdentity, type Identity } from '../packages/federation/protocol.js';
import { installIdentity, configurePeer } from '../packages/federation/provision.js';
import { IDS } from '../fixtures/records.js';

const directory = resolve('.nexus/federation');
await mkdir(directory, { recursive: true, mode: 0o700 });
const nodes = [];
for (const [name, label, port, operator] of [
  ['north', 'Northern Commons', 4320, IDS.alice],
  ['south', 'Southern Commons', 4322, IDS.bob],
] as const) {
  const root = resolve(directory, name);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const config = { ...(await bootstrap(root, port, true)), browser_host: `${name}.localhost` };
  await writeFile(resolve(root, 'local.json'), JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
  const admin = createPool(config.admin_url);
  let identity: Identity;
  try {
    const access = await seed(admin, {
      accessPath: resolve(root, 'access.json'),
      records: name === 'north',
    });
    const identityPath = resolve(root, 'identity.json');
    if (existsSync(identityPath)) identity = await loadIdentity(identityPath);
    else {
      identity = createIdentity(label, operator);
      const keyPath = resolve(root, 'node-key.pem');
      await writeFile(keyPath, identity.private_key, { mode: 0o600 });
      const { private_key: _, ...publicIdentity } = identity;
      await writeFile(
        identityPath,
        JSON.stringify({ ...publicIdentity, private_key_file: keyPath }, null, 2) + '\n',
        { mode: 0o600 },
      );
    }
    await installIdentity(admin, identity);
    const { private_key: secretKey, ...descriptor } = identity;
    const { operator_id: operatorId, ...publicDescriptor } = descriptor;
    await writeFile(
      resolve(root, 'public-node.json'),
      JSON.stringify({ ...publicDescriptor, endpoint: config.origin }, null, 2) + '\n',
      { mode: 0o600 },
    );
    for (const role of ['server', 'worker', 'federation'] as const) {
      const key =
        role === 'server' ? 'app_url' : role === 'worker' ? 'worker_url' : 'federation_url';
      await writeFile(
        resolve(root, `runtime-${role}.json`),
        JSON.stringify(
          {
            [key]: config[key],
            port,
            origin: config.origin,
            ...(role === 'server' ? { browser_host: config.browser_host } : {}),
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
    }
    await writeFile(
      resolve(root, 'agent.token'),
      name === 'north' ? access.alice_agent : access.bob_agent,
      { mode: 0o600 },
    );
    nodes.push({ name, root, config, identity });
  } finally {
    await admin.end();
  }
}
for (const node of nodes) {
  const other = nodes.find((n) => n !== node)!;
  const admin = createPool(node.config.admin_url);
  try {
    await configurePeer(admin, other.identity, other.config.origin);
  } finally {
    await admin.end();
  }
}
const mcpServers = Object.fromEntries(
  nodes.map((node) => [
    `nexus-${node.name}`,
    {
      command: process.execPath,
      args: [resolve('dist/apps/mcp/main.js')],
      env: { NEXUS_URL: node.config.origin, NEXUS_TOKEN_FILE: resolve(node.root, 'agent.token') },
    },
  ]),
);
await writeFile(
  resolve(directory, 'mcp-config.json'),
  JSON.stringify({ mcpServers }, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(
  'Prepared two separate PostgreSQL containers, credentials, node identities and pinned peers.',
);
console.log('North: http://north.localhost:4320 · South: http://south.localhost:4322');
console.log(
  'Import consent and per-record export/review remain explicit. Existing decisions are preserved.',
);

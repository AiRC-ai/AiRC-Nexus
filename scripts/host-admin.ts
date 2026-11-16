import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createPool, tokenHash } from '../packages/db/index.js';
import { configurePeer } from '../packages/federation/provision.js';
import type { HostedAccess } from '../packages/federation/hosted.js';

const password = (await readFile('/run/secrets/postgres_password', 'utf8')).trim();
if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('invalid_operator_secret');
const pool = createPool(`postgresql://postgres:${password}@database:5432/nexus`);
const access = JSON.parse(await readFile('/state/operator/access.json', 'utf8')) as HostedAccess;
const [action, path] = process.argv.slice(2);
try {
  if (action === 'peer') {
    const peer = z
      .object({
        node_id: z.uuid(),
        label: z.string(),
        key_id: z.string(),
        public_key: z.string(),
        endpoint: z.string(),
      })
      .strict()
      .parse(JSON.parse(await readFile(path ?? '', 'utf8')));
    await configurePeer(pool, peer, peer.endpoint, true);
    console.log(
      'Pinned the explicit HTTPS peer descriptor; participation decisions were preserved.',
    );
  } else if (action === 'login' || action === 'test-session') {
    const code = `nexus_login_${randomBytes(32).toString('hex')}`;
    if (action === 'login')
      await pool.query(
        "UPDATE nexus.credentials SET revoked_at=clock_timestamp() WHERE principal_id=$1 AND kind='exchange'",
        [access.operator_id],
      );
    await pool.query(
      "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'exchange',now()+interval '15 minutes')",
      [
        tokenHash(code),
        access.operator_id,
        ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw'],
      ],
    );
    // Private output file only: no code on stdout or in process arguments.
    await writeFile('/state/operator/login.json', JSON.stringify({ code }, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log('Prepared a one-time operator code in the protected host-local login file.');
  } else if (action === 'test-team') {
    const team = randomUUID();
    await pool.query("INSERT INTO nexus.teams(id,name) VALUES($1,'Host-local validation team')", [
      team,
    ]);
    await pool.query('INSERT INTO nexus.memberships(team_id,owner_id) VALUES($1,$2)', [
      team,
      access.operator_id,
    ]);
    await writeFile('/state/operator/test-team.json', JSON.stringify({ team_id: team }) + '\n', {
      mode: 0o600,
    });
    console.log('Prepared a host-local validation team.');
  } else throw new Error('Use peer, login, test-session, or test-team.');
} finally {
  await pool.end();
}

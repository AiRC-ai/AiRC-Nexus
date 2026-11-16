import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { type Pool, tokenHash } from '../db/index.js';
import { ANONYMOUS } from '../contracts/index.js';
import { httpsOrigin } from '../core/node-http.js';
import { createIdentity, loadIdentity } from './protocol.js';
import { installIdentity } from './provision.js';

const AccessSchema = z
  .object({
    operator_id: z.uuid(),
    agent_id: z.uuid(),
    operator_code: z.string().min(32),
    agent_token: z.string().min(32),
  })
  .strict();
export type HostedAccess = z.infer<typeof AccessSchema>;
/** Provision only this host's unique operator/agent. No shared demo accounts or corpus. */
export async function provisionHosted(
  admin: Pool,
  options: { stateDir: string; origin: string; label: string; operatorName: string },
) {
  z.string().trim().min(1).max(100).parse(options.label);
  z.string().trim().min(1).max(120).parse(options.operatorName);
  const origin = httpsOrigin(options.origin),
    root = resolve(options.stateDir);
  for (const part of ['operator', 'identity', 'public'])
    await mkdir(resolve(root, part), { recursive: true, mode: 0o700 });
  const accessFile = resolve(root, 'operator/access.json');
  const access: HostedAccess = existsSync(accessFile)
    ? AccessSchema.parse(JSON.parse(await readFile(accessFile, 'utf8')))
    : {
        operator_id: randomUUID(),
        agent_id: randomUUID(),
        operator_code: `nexus_login_${randomBytes(32).toString('hex')}`,
        agent_token: `nexus_agent_${randomBytes(32).toString('hex')}`,
      };
  await writeFile(accessFile, JSON.stringify(access, null, 2) + '\n', { mode: 0o600 });
  const db = await admin.connect();
  try {
    await db.query('BEGIN');
    for (const [id, owner, name, kind, role] of [
      [ANONYMOUS.id, ANONYMOUS.id, 'Public reader', 'anonymous', 'reader'],
      [access.operator_id, access.operator_id, options.operatorName, 'human', 'owner'],
      [access.agent_id, access.operator_id, `${options.label} agent`, 'agent', 'reader'],
    ])
      await db.query(
        'INSERT INTO nexus.principals(id,owner_id,name,kind,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [id, owner, name, kind, role],
      );
    for (const [token, id, kind, scopes] of [
      [
        access.operator_code,
        access.operator_id,
        'exchange',
        ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw'],
      ],
      [access.agent_token, access.agent_id, 'agent', ['read', 'draft', 'outcome']],
    ] as const)
      await db.query(
        "INSERT INTO nexus.credentials(token_hash,principal_id,kind,scopes,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days') ON CONFLICT(token_hash) DO NOTHING",
        [tokenHash(token), id, kind, scopes],
      );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
  const identityFile = resolve(root, 'identity/identity.json');
  let identity;
  if (existsSync(identityFile)) identity = await loadIdentity(identityFile);
  else {
    identity = createIdentity(options.label, access.operator_id);
    await writeFile(resolve(root, 'identity/node-key.pem'), identity.private_key, { mode: 0o600 });
    const { private_key: _, ...descriptor } = identity;
    await writeFile(
      identityFile,
      JSON.stringify({ ...descriptor, private_key_file: 'node-key.pem' }, null, 2) + '\n',
      { mode: 0o600 },
    );
  }
  if (identity.operator_id !== access.operator_id) throw new Error('operator_identity_mismatch');
  await installIdentity(admin, identity);
  const descriptor = {
    node_id: identity.node_id,
    label: identity.label,
    key_id: identity.key_id,
    public_key: identity.public_key,
    endpoint: origin,
  };
  await writeFile(resolve(root, 'public/node.json'), JSON.stringify(descriptor, null, 2) + '\n', {
    mode: 0o600,
  });
  await writeFile(resolve(root, 'operator/agent.token'), access.agent_token, { mode: 0o600 });
  return { identity, access, descriptor };
}

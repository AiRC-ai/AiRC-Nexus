import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createPool } from '../packages/db/index.js';
import { createIdentity, loadIdentity } from '../packages/federation/protocol.js';
import { configurePeer } from '../packages/federation/provision.js';

const [rawNode, action, rawPeer] = process.argv.slice(2);
const name = z.enum(['north', 'south']).parse(rawNode),
  root = resolve('.nexus/federation', name);
const config = JSON.parse(await readFile(resolve(root, 'local.json'), 'utf8'));
const admin = createPool(config.admin_url);
try {
  if (action === 'rotate-key') {
    const prior = await loadIdentity(resolve(root, 'identity.json'));
    const next = createIdentity(prior.label, prior.operator_id);
    next.node_id = prior.node_id;
    const keyFile = resolve(root, 'node-key.pem'),
      identityFile = resolve(root, 'identity.json');
    const publicDescriptor = {
      node_id: next.node_id,
      label: next.label,
      key_id: next.key_id,
      public_key: next.public_key,
    };
    await writeFile(keyFile + '.next', next.private_key, { mode: 0o600 });
    await writeFile(
      identityFile + '.next',
      JSON.stringify(
        { ...publicDescriptor, operator_id: next.operator_id, private_key_file: keyFile },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    // Any interruption fails the runtime's DB/key consistency check; it never authorizes the old key as new.
    await admin.query(
      'UPDATE nexus.federation_identity SET key_id=$1,public_key=$2 WHERE node_id=$3',
      [next.key_id, next.public_key, next.node_id],
    );
    await rename(keyFile + '.next', keyFile);
    await rename(identityFile + '.next', identityFile);
    await writeFile(
      resolve(root, 'public-node.json'),
      JSON.stringify({ ...publicDescriptor, endpoint: config.origin }, null, 2) + '\n',
      { mode: 0o600 },
    );
    console.log(
      'Rotated the local signing key. Restart federation services and explicitly install this new public pin at each recipient. Prior recipient approval will not carry over.',
    );
  } else if (action === 'revoke-peer' || action === 'trust-peer') {
    const peerName = z.enum(['north', 'south']).parse(rawPeer);
    if (peerName === name) throw new Error('distinct_peer_required');
    const peer = z
      .object({
        node_id: z.uuid(),
        label: z.string(),
        key_id: z.string(),
        public_key: z.string(),
        endpoint: z.string(),
      })
      .strict()
      .parse(
        JSON.parse(
          await readFile(resolve('.nexus/federation', peerName, 'public-node.json'), 'utf8'),
        ),
      );
    if (action === 'revoke-peer')
      await admin.query('UPDATE nexus.federation_peers SET active=false WHERE node_id=$1', [
        peer.node_id,
      ]);
    else {
      await configurePeer(admin, peer, peer.endpoint);
      await admin.query('UPDATE nexus.federation_peers SET active=true WHERE node_id=$1', [
        peer.node_id,
      ]);
    }
    console.log(
      action === 'revoke-peer'
        ? 'Revoked the peer pin and invalidated local cached context.'
        : 'Explicitly trusted the selected local public descriptor. Changed keys require new record review.',
    );
  } else
    throw new Error(
      'Use: federation:admin -- north|south rotate-key | revoke-peer|trust-peer north|south',
    );
} finally {
  await admin.end();
}

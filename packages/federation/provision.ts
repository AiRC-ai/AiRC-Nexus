import { z } from 'zod';
import type { Pool } from '../db/index.js';
import { keyId, peerEndpoint, type Identity } from './protocol.js';

/** Operator-only provisioning. Never exposed as an MCP or browser endpoint. */
export async function installIdentity(admin: Pool, identity: Identity) {
  const old = (await admin.query('SELECT node_id,key_id FROM nexus.federation_identity')).rows[0];
  if (old && (old.node_id !== identity.node_id || old.key_id !== identity.key_id))
    throw new Error('identity_already_initialized');
  if (keyId(identity.public_key) !== identity.key_id) throw new Error('invalid_identity_pin');
  await admin.query(
    'INSERT INTO nexus.federation_identity(node_id,label,key_id,public_key,operator_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [identity.node_id, identity.label, identity.key_id, identity.public_key, identity.operator_id],
  );
  await admin.query(
    "UPDATE nexus.records SET origin_node=$1 WHERE origin_node='nexus-local-demo'",
    [identity.node_id],
  );
}
export async function configurePeer(
  admin: Pool,
  peer: Pick<Identity, 'node_id' | 'label' | 'key_id' | 'public_key'>,
  endpoint: string,
  httpsOnly = false,
) {
  z.uuid().parse(peer.node_id);
  z.string().min(1).max(100).parse(peer.label);
  if (keyId(peer.public_key) !== peer.key_id) throw new Error('invalid_peer_pin');
  const url = peerEndpoint(endpoint, httpsOnly),
    db = await admin.connect();
  try {
    await db.query('BEGIN');
    const own = (await db.query('SELECT node_id FROM nexus.federation_identity FOR UPDATE'))
      .rows[0];
    if (!own || own.node_id === peer.node_id) throw new Error('distinct_node_required');
    const count = (
      await db.query(
        'SELECT count(*)::integer AS n FROM nexus.federation_peers WHERE node_id<>$1',
        [peer.node_id],
      )
    ).rows[0].n;
    if (count >= 16) throw new Error('peer_limit');
    await db.query(
      `INSERT INTO nexus.federation_peers(node_id,label,endpoint,key_id,public_key) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(node_id) DO UPDATE SET label=EXCLUDED.label,endpoint=EXCLUDED.endpoint,key_id=EXCLUDED.key_id,public_key=EXCLUDED.public_key`,
      [peer.node_id, peer.label, url, peer.key_id, peer.public_key],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

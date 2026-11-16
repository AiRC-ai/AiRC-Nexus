import { type Pool } from '../db/index.js';
import { screen } from '../core/screen.js';
import { nodeRequest } from '../core/node-http.js';
import {
  acceptSnapshot,
  artifactDigest,
  peerEndpoint,
  requestFor,
  MAX_PACKET_BYTES,
  type Identity,
} from './protocol.js';

export async function syncPeer(
  pool: Pool,
  identity: Identity,
  peer: { node_id: string; endpoint: string; key_id: string; public_key: string },
  transport: { httpsOnly?: boolean; caFile?: string } = {},
) {
  const db = await pool.connect();
  let locked = false;
  try {
    locked = (
      await db.query('SELECT pg_try_advisory_lock(hashtextextended($1,4318)) AS locked', [
        `federation:${peer.node_id}`,
      ])
    ).rows[0].locked;
    if (!locked) return { status: 'busy' };
    const own = (await db.query('SELECT node_id,key_id FROM nexus.fed_worker_identity()')).rows[0];
    if (own?.node_id !== identity.node_id || own?.key_id !== identity.key_id)
      throw new Error('identity_mismatch');
    const started = Date.now();
    const { request, envelope } = requestFor(identity, peer.node_id, started);
    const response = await nodeRequest(
      new URL('/api/federation/v1/snapshot', peerEndpoint(peer.endpoint, transport.httpsOnly)),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        timeoutMs: 3000,
        maxBytes: MAX_PACKET_BYTES,
        ...(transport.caFile ? { caFile: transport.caFile } : {}),
      },
    );
    if (response.status !== 200) throw new Error('peer_unavailable');
    const { packet, until } = acceptSnapshot(
      JSON.parse(response.text),
      peer,
      identity.node_id,
      request.nonce,
      started,
    );
    const items = packet.items.map((item) =>
      item.state === 'active'
        ? { ...item, artifact_digest: artifactDigest(item), blocked: screen(item.content).blocked }
        : item,
    );
    const applied = (
      await db.query('SELECT nexus.fed_apply($1,$2,$3,$4,$5) AS applied', [
        peer.node_id,
        peer.key_id,
        packet.sequence,
        new Date(until),
        JSON.stringify(items),
      ])
    ).rows[0].applied;
    return {
      status: applied ? 'applied' : 'older_snapshot',
      sequence: packet.sequence,
      items: items.length,
    };
  } catch {
    if (locked) await db.query('SELECT nexus.fed_invalidate($1)', [peer.node_id]);
    return { status: 'unavailable' };
  } finally {
    if (locked)
      await db.query('SELECT pg_advisory_unlock(hashtextextended($1,4318))', [
        `federation:${peer.node_id}`,
      ]);
    db.release();
  }
}
export async function syncAll(
  pool: Pool,
  identity: Identity,
  transport: { httpsOnly?: boolean; caFile?: string } = {},
) {
  const peers = (await pool.query('SELECT * FROM nexus.fed_worker_peers()')).rows;
  const results = [];
  for (const peer of peers)
    results.push({ peer_id: peer.node_id, ...(await syncPeer(pool, identity, peer, transport)) });
  return results;
}

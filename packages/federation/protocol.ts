import {
  createPrivateKey,
  createPublicKey,
  createHash,
  generateKeyPairSync,
  sign,
  verify,
  randomUUID,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import canonicalize from 'canonicalize';
import { ContentSchema, AssessmentSchema, EvidenceOutcomeSchema } from '../contracts/index.js';

export const PROTOCOL = 'airc-nexus-federation/0.2' as const;
export const LEASE_MS = 30_000;
export const MAX_PACKET_BYTES = 1_048_576;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const serial = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const EvidenceSummarySchema = z
  .object({
    method: AssessmentSchema.shape.method,
    outcome: EvidenceOutcomeSchema,
    count: z.number().int().positive().max(2_147_483_647),
  })
  .strict();
export const ActiveItemSchema = z
  .object({
    state: z.literal('active'),
    record_id: z.uuid(),
    revision_id: z.uuid(),
    sequence: serial,
    digest: hash,
    content: ContentSchema,
    evidence: z.array(EvidenceSummarySchema).max(16),
  })
  .strict();
export const ItemSchema = z.discriminatedUnion('state', [
  ActiveItemSchema,
  z.object({ state: z.literal('unavailable'), record_id: z.uuid() }).strict(),
]);
const common = {
  protocol: z.literal(PROTOCOL),
  origin: z.uuid(),
  audience: z.uuid(),
  key_id: hash,
};
export const RequestSchema = z
  .object({
    ...common,
    operation: z.literal('public_snapshot'),
    nonce: z.uuid(),
    issued_at: serial,
  })
  .strict();
export const SnapshotSchema = z
  .object({
    ...common,
    request_nonce: z.uuid(),
    issued_at: serial,
    expires_at: serial,
    sequence: serial,
    complete: z.literal(true),
    items: z.array(ItemSchema).max(100),
  })
  .strict();
export const EnvelopeSchema = z
  .object({ payload: z.unknown(), signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) })
  .strict();
export interface Identity {
  node_id: string;
  label: string;
  key_id: string;
  public_key: string;
  private_key: string;
  operator_id: string;
}
export type ActiveItem = z.infer<typeof ActiveItemSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Signed = { payload: unknown; signature: string };
export const canonicalBytes = (value: unknown) => {
  const text = canonicalize(value);
  if (!text) throw new Error('invalid_canonical_data');
  return Buffer.from(text, 'utf8');
};
export const artifactDigest = (value: unknown) =>
  createHash('sha256').update(canonicalBytes(value)).digest('hex');
export function keyId(pem: string) {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('ed25519_required');
  return createHash('sha256')
    .update(key.export({ format: 'der', type: 'spki' }))
    .digest('hex');
}
export function createIdentity(label: string, operator_id: string): Identity {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const public_key = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return {
    node_id: randomUUID(),
    label,
    operator_id,
    key_id: keyId(public_key),
    public_key,
    private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}
export async function loadIdentity(path: string): Promise<Identity> {
  const config = z
    .object({
      node_id: z.uuid(),
      label: z.string().min(1).max(100),
      key_id: hash,
      operator_id: z.uuid(),
      private_key_file: z.string().min(1),
      public_key: z.string().max(2048),
    })
    .strict()
    .parse(JSON.parse(await readFile(path, 'utf8')));
  const private_key = await readFile(config.private_key_file, 'utf8');
  if (
    createPrivateKey(private_key).asymmetricKeyType !== 'ed25519' ||
    keyId(config.public_key) !== config.key_id ||
    keyId(createPublicKey(private_key).export({ type: 'spki', format: 'pem' }).toString()) !==
      config.key_id
  )
    throw new Error('identity_key_mismatch');
  return {
    node_id: config.node_id,
    label: config.label,
    key_id: config.key_id,
    public_key: config.public_key,
    private_key,
    operator_id: config.operator_id,
  };
}
export function signed(identity: Identity, payload: unknown): Signed {
  return {
    payload,
    signature: sign(null, canonicalBytes(payload), identity.private_key).toString('base64url'),
  };
}
export function verified(value: unknown, publicKey: string): unknown {
  const envelope = EnvelopeSchema.parse(value);
  if (
    !verify(
      null,
      canonicalBytes(envelope.payload),
      publicKey,
      Buffer.from(envelope.signature, 'base64url'),
    )
  )
    throw new Error('invalid_signature');
  return envelope.payload;
}
export function requestFor(identity: Identity, audience: string, now = Date.now()) {
  const payload = RequestSchema.parse({
    protocol: PROTOCOL,
    operation: 'public_snapshot',
    origin: identity.node_id,
    audience,
    key_id: identity.key_id,
    nonce: randomUUID(),
    issued_at: now,
  });
  return { request: payload, envelope: signed(identity, payload) };
}
export function acceptSnapshot(
  value: unknown,
  peer: { node_id: string; key_id: string; public_key: string },
  ownId: string,
  nonce: string,
  started: number,
  now = Date.now(),
) {
  if (keyId(peer.public_key) !== peer.key_id) throw new Error('pin_mismatch');
  const raw = verified(value, peer.public_key);
  const packet = SnapshotSchema.parse(raw);
  if (artifactDigest(raw) !== artifactDigest(packet)) throw new Error('noncanonical_schema');
  if (
    packet.origin !== peer.node_id ||
    packet.audience !== ownId ||
    packet.key_id !== peer.key_id ||
    packet.request_nonce !== nonce
  )
    throw new Error('snapshot_binding_mismatch');
  if (
    packet.issued_at > now + 5000 ||
    packet.issued_at < started - 5000 ||
    packet.expires_at <= now ||
    packet.expires_at > packet.issued_at + LEASE_MS
  )
    throw new Error('snapshot_time_invalid');
  const until = Math.min(packet.expires_at, started + LEASE_MS);
  if (until <= now) throw new Error('snapshot_expired');
  const seen = new Set<string>();
  for (const item of packet.items) {
    if (seen.has(item.record_id)) throw new Error('duplicate_record');
    seen.add(item.record_id);
    if (
      item.state === 'active' &&
      artifactDigest({ ...item.content, intended_visibility: 'public' }) !== item.digest
    )
      throw new Error('content_digest_mismatch');
  }
  return { packet, until };
}
export function peerEndpoint(value: string) {
  const url = new URL(value);
  const port = Number(url.port);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('loopback_peer_required');
  return url.origin;
}

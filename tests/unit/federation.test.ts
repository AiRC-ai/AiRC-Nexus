import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createIdentity,
  requestFor,
  signed,
  verified,
  acceptSnapshot,
  artifactDigest,
  peerEndpoint,
  PROTOCOL,
  LEASE_MS,
} from '../../packages/federation/protocol.js';
import { publicFixtures, IDS } from '../../fixtures/records.js';

describe('signed federation envelope', () => {
  const a = createIdentity('North', IDS.alice),
    b = createIdentity('South', IDS.bob);
  const peer = { node_id: a.node_id, key_id: a.key_id, public_key: a.public_key };
  const request = requestFor(b, a.node_id);
  const item = {
    state: 'active' as const,
    record_id: publicFixtures[0]!.id,
    revision_id: publicFixtures[0]!.revision_id,
    sequence: 1,
    digest: artifactDigest({ ...publicFixtures[0]!.content, intended_visibility: 'public' }),
    content: publicFixtures[0]!.content,
    evidence: [],
  };
  const now = Date.now();
  const payload = {
    protocol: PROTOCOL,
    origin: a.node_id,
    audience: b.node_id,
    key_id: a.key_id,
    request_nonce: request.request.nonce,
    issued_at: now,
    expires_at: now + LEASE_MS,
    sequence: 1,
    complete: true,
    items: [item],
  };
  const accept = (data: unknown) =>
    acceptSnapshot(data, peer, b.node_id, request.request.nonce, now, now);
  it('signs canonical JSON and checks exact content, origin, audience and challenge', () => {
    expect(verified(signed(a, { b: 2, a: 1 }), a.public_key)).toEqual({ a: 1, b: 2 });
    expect(accept(signed(a, payload)).packet.items[0]).toEqual(item);
    for (const changed of [
      { audience: randomUUID() },
      { origin: randomUUID() },
      { request_nonce: randomUUID() },
      { key_id: b.key_id },
      { protocol: 'other/1' },
    ])
      expect(() => accept(signed(a, { ...payload, ...changed }))).toThrow();
    const envelope = signed(a, payload);
    expect(() => accept({ ...envelope, payload: { ...payload, sequence: 2 } })).toThrow();
  });
  it('rejects expired, excessive-lease, conflicting, malformed and transformed records', () => {
    for (const changed of [
      { expires_at: now },
      { expires_at: now + LEASE_MS + 1 },
      { issued_at: now + 10000 },
      { complete: false },
      { items: [item, item] },
      { items: [{ ...item, digest: 'b'.repeat(64) }] },
      { items: [{ ...item, content: { ...item.content, title: ` ${item.content.title} ` } }] },
    ])
      expect(() => accept(signed(a, { ...payload, ...changed }))).toThrow();
    expect(() =>
      acceptSnapshot(
        signed(a, payload),
        { ...peer, public_key: b.public_key },
        b.node_id,
        request.request.nonce,
        now,
        now,
      ),
    ).toThrow();
  });
  it('keeps peer transport on explicitly configured loopback roots', () => {
    expect(peerEndpoint('http://127.0.0.1:4320')).toBe('http://127.0.0.1:4320');
    for (const url of [
      'http://localhost:4320',
      'http://127.0.0.1:80',
      'http://127.0.0.1:4320/private',
      'http://user:password@127.0.0.1:4320',
      'http://127.0.0.1:4320/?next=secret',
    ])
      expect(() => peerEndpoint(url)).toThrow();
    expect(peerEndpoint('https://node.example.org:9443', true)).toBe(
      'https://node.example.org:9443',
    );
    expect(() => peerEndpoint('http://127.0.0.1:4320', true)).toThrow();
  });
});

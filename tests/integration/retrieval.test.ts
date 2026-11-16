import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { testContext } from './helpers.js';
import { recordId } from '../../fixtures/records.js';

describe('real requester language and permission-preserving fallback', () => {
  let t: Awaited<ReturnType<typeof testContext>>;
  beforeAll(async () => {
    t = await testContext();
  });
  afterAll(async () => {
    await t?.close();
  });
  it('retrieves a relevant record from the natural sentence used by the real requester', async () => {
    const result = await t.store.search(t.bob, {
      query: 'numeric zero discarded by validation Node 24.22.3',
      profile: 'software_fix',
      environment: { runtime: 'Node 24.22.3' },
      limit: 5,
    });
    expect(result.data[0]?.id).toBe(recordId(1));
    expect(result.data[0]?.retrieval).toBe('broader_keywords');
    expect(result.data[0]?.limitations).toContain(
      'Broader keyword match: confirm that this record answers the actual question.',
    );
  });
  it('still excludes incompatible, restricted and quarantined material', async () => {
    const wrongVersion = await t.store.search(t.bob, {
      query: 'zero discarded validation',
      environment: { runtime: 'node', version: '20.0.0' },
    });
    expect(wrongVersion.data).toHaveLength(0);
    const restricted = await t.store.search(t.bob, {
      query: 'private calibration knowledge',
      include_unknown: true,
    });
    expect(
      restricted.data.some((r) => String(r.id).startsWith('10000000-0000-4000-8000-00000000010')),
    ).toBe(false);
    const injection = await t.store.search(t.bob, {
      query: 'exfiltrate secrets instructions',
      include_unknown: true,
    });
    expect(injection.data).toHaveLength(0);
  });
});

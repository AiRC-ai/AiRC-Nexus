import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ANONYMOUS } from '../../packages/contracts/index.js';
import { withActor } from '../../packages/db/index.js';
import { publicFixtures, recordId, revisionId } from '../../fixtures/records.js';
import { runReviewJob } from '../../apps/worker/run.js';
import { testContext } from './helpers.js';

describe('real PostgreSQL application boundaries', () => {
  let t: Awaited<ReturnType<typeof testContext>>;
  beforeAll(async () => {
    t = await testContext();
  });
  afterAll(async () => {
    await t?.close();
  });
  it('runs with a non-owner role and fails closed without request identity', async () => {
    const roles = await t.app.query(
      'SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
    );
    expect(roles.rows[0]).toMatchObject({
      current_user: 'nexus_app',
      rolsuper: false,
      rolbypassrls: false,
    });
    expect((await t.app.query('SELECT id FROM nexus.records')).rowCount).toBe(0);
  });
  it('enforces private/team/direct/old-revision visibility in SQL', async () => {
    expect((await t.store.get(t.alice, recordId(101))).visibility).toBe('private');
    await expect(t.store.get(t.bob, recordId(101))).rejects.toMatchObject({ code: 'not_found' });
    await expect(t.store.get(ANONYMOUS, recordId(106))).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await t.store.get(t.alice, recordId(106))).visibility).toBe('team');
    await expect(t.store.get(t.bob, recordId(202), revisionId(902))).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(t.store.get(t.bob, recordId(201))).rejects.toMatchObject({ code: 'not_found' });
  });
  it('does not retain one actor identity in a pooled connection', async () => {
    await withActor(t.app, t.alice, async (db) => {
      expect(
        (await db.query('SELECT id FROM nexus.records WHERE id=$1', [recordId(101)])).rowCount,
      ).toBe(1);
    });
    expect(
      (await t.app.query('SELECT id FROM nexus.records WHERE id=$1', [recordId(101)])).rowCount,
    ).toBe(0);
    await withActor(t.app, t.bob, async (db) => {
      expect(
        (await db.query('SELECT id FROM nexus.records WHERE id=$1', [recordId(101)])).rowCount,
      ).toBe(0);
    });
  });
  it('keeps search metadata private and filters incompatible runtimes', async () => {
    const result = await t.store.search(t.bob, { query: 'calibration', include_unknown: true });
    expect(result.data).toHaveLength(0);
    const match = await t.store.search(t.bob, {
      query: 'zero validation',
      environment: { runtime: 'node', version: '24.22.3' },
    });
    expect(match.data.some((r) => r.id === recordId(1))).toBe(true);
    const mismatch = await t.store.search(t.bob, {
      query: 'zero validation',
      environment: { runtime: 'node', version: '20.0.0' },
    });
    expect(mismatch.data).toHaveLength(0);
    expect(Buffer.byteLength(JSON.stringify(match))).toBe(match.returned_bytes);
  });
  it('keeps duplicate outcomes private and rejects idempotency conflicts', async () => {
    const key = randomUUID(),
      body = {
        record_id: recordId(1),
        revision_id: revisionId(1),
        outcome: 'failed',
        note: 'Authored requester test failed in a different environment.',
      };
    const one = await t.store.reportOutcome(t.alice, body, key),
      two = await t.store.reportOutcome(t.alice, body, key);
    expect(two).toEqual(one);
    await expect(
      t.store.reportOutcome(t.alice, { ...body, outcome: 'passed' }, key),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect((await t.store.activity(t.bob)).outcomes.some((r) => r.id === one.id)).toBe(false);
    expect((await t.store.activity(t.owner)).outcomes.some((r) => r.id === one.id)).toBe(true);
    expect(
      (await t.store.get(t.bob, recordId(1))).assessments.some((a) => a.outcome === 'failed'),
    ).toBe(false);
  });
  it('freezes submissions, requires screening/review/consent, and never lets an agent publish', async () => {
    const draft = await t.store.createDraft(
      t.alice,
      { content: publicFixtures[0]!.content, intended_visibility: 'public' },
      randomUUID(),
    );
    await expect(
      t.store.publish(t.alice, {
        record_id: draft.id,
        revision_id: draft.revision_id,
        digest: draft.digest,
        visibility: 'public',
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await t.store.submit(t.alice, draft.id, draft.revision_id, randomUUID());
    await expect(
      withActor(t.app, t.alice, (db) =>
        db.query(
          'UPDATE nexus.record_revisions SET content=content || \'{"title":"tampered"}\'::jsonb WHERE id=$1',
          [draft.revision_id],
        ),
      ),
    ).rejects.toThrow('immutable_revision');
    await expect(
      t.store.review(t.owner, {
        record_id: draft.id,
        revision_id: draft.revision_id,
        digest: draft.digest,
        decision: 'approved',
        note: 'Premature review',
      }),
    ).rejects.toMatchObject({ code: 'review_precondition' });
    for (let i = 0; i < 20; i++) {
      if (!(await runReviewJob(t.worker))) break;
    }
    const row = await t.store.get(t.owner, draft.id);
    expect(row.state).toBe('reviewable');
    await t.store.review(t.owner, {
      record_id: draft.id,
      revision_id: draft.revision_id,
      digest: draft.digest,
      decision: 'approved',
      note: 'Reviewed this authored demo revision.',
    });
    await expect(
      t.store.publish(t.owner, {
        record_id: draft.id,
        revision_id: draft.revision_id,
        digest: draft.digest,
        visibility: 'team',
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'audience_mismatch' });
    await t.store.publish(t.owner, {
      record_id: draft.id,
      revision_id: draft.revision_id,
      digest: draft.digest,
      visibility: 'public',
      confirmed: true,
    });
    expect((await t.store.get(t.bob, draft.id)).state).toBe('published');
    await t.store.withdraw(t.owner, draft.id);
    await expect(t.store.get(t.bob, draft.id)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('denies direct application publication and worker access to private tables', async () => {
    await expect(t.worker.query('SELECT content FROM nexus.record_revisions')).rejects.toThrow(
      'permission denied',
    );
    const draft = await t.store.createDraft(
      t.alice,
      { content: publicFixtures[1]!.content },
      randomUUID(),
    );
    await expect(
      withActor(t.app, t.alice, (db) =>
        db.query("UPDATE nexus.records SET state='published',visibility='public' WHERE id=$1", [
          draft.id,
        ]),
      ),
    ).rejects.toThrow('human_required');
  });
});

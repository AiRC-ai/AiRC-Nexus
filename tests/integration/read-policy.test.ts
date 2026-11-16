import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { testContext } from './helpers.js';
import { ANONYMOUS, type Principal } from '../../packages/contracts/index.js';
import { withActor } from '../../packages/db/index.js';
import { IDS, revisionId } from '../../fixtures/records.js';

describe('set-based read policy equivalence', () => {
  let t: Awaited<ReturnType<typeof testContext>>;
  beforeAll(async () => {
    t = await testContext();
  });
  afterAll(async () => {
    await t?.close();
  });
  const compare = async () => {
    const principals: Principal[] = [
      ANONYMOUS,
      t.alice,
      t.bob,
      t.owner,
      { ...t.owner, id: IDS.bob, owner_id: IDS.bob },
      { ...t.owner, id: IDS.reviewer, owner_id: IDS.reviewer, role: 'reviewer' },
    ];
    for (const actor of principals) {
      // Admin is only the test oracle, so denied rows are included in the comparison.
      const oracle = await withActor(
        t.admin,
        actor,
        async (db) =>
          (
            await db.query(
              `SELECT id,nexus.can_read_revision(id) AS legacy,id IN (SELECT nexus.readable_revision_ids()) AS batched
         FROM nexus.record_revisions ORDER BY id`,
            )
          ).rows,
      );
      expect(oracle.every((r) => r.legacy === r.batched)).toBe(true);
      const visible = await withActor(t.app, actor, async (db) =>
        (await db.query('SELECT id FROM nexus.record_revisions ORDER BY id')).rows.map((r) => r.id),
      );
      expect(visible).toEqual(oracle.filter((r) => r.legacy).map((r) => r.id));
    }
  };
  it('preserves all owner, agent, anonymous, team and assigned-reviewer decisions', async () => {
    await t.admin.query(
      'INSERT INTO nexus.review_assignments(revision_id,reviewer_id) VALUES($1,$2)',
      [revisionId(101), IDS.reviewer],
    );
    await compare();
  });
  it('reflects revoked grants and removed memberships without a stale policy cache', async () => {
    await t.admin.query(
      'UPDATE nexus.publication_grants SET revoked_at=clock_timestamp() WHERE revision_id=$1',
      [revisionId(1)],
    );
    await t.admin.query('DELETE FROM nexus.memberships WHERE owner_id=$1', [IDS.alice]);
    await compare();
    await t.admin.query('BEGIN');
    try {
      await t.admin.query("SELECT set_config('nexus.principal_id','',true)");
      expect((await t.admin.query('SELECT * FROM nexus.readable_revision_ids()')).rowCount).toBe(0);
    } finally {
      await t.admin.query('ROLLBACK');
    }
  });
});

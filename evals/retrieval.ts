import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { testContext } from '../tests/integration/helpers.js';
import { buildApp } from '../apps/server/app.js';
import { ANONYMOUS } from '../packages/contracts/index.js';
import { withActor } from '../packages/db/index.js';
import { publicFixtures, recordId } from '../fixtures/records.js';
import { digest } from '../packages/core/store.js';

interface Task {
  id: string;
  kind: 'answerable' | 'wrong_version' | 'unanswerable';
  query: string;
  expected_record: number | null;
  environment: Record<string, string>;
  profile: string | null;
  include_unknown: boolean;
}
const raw = await readFile('evals/tasks.json', 'utf8');
const manifest = JSON.parse(raw) as { tasks: Task[]; scope: string };
assert.equal(manifest.tasks.length, 50);
const t = await testContext();
const ids = publicFixtures.map((f) => f.id);
const approved = new Set(ids);
const results: unknown[] = [];
const summary = {
  answerable: 30,
  nexus_hit_at_5: 0,
  flat_keyword_hit_at_5: 0,
  wrong_version_tasks: 10,
  wrong_version_excluded: 0,
  unknown_tasks: 10,
  unknown_no_candidates: 0,
};
const app = await buildApp(t.app);
try {
  for (const task of manifest.tasks) {
    const nexus = await t.store.search(ANONYMOUS, {
      query: task.query,
      environment: task.environment,
      include_unknown: task.include_unknown,
      ...(task.profile ? { profile: task.profile } : {}),
      limit: 5,
      budget_bytes: 32000,
    });
    // Same public, licensed corpus and same RLS; flat keywords do not interpret environment/evidence.
    const baseline = await withActor(t.app, ANONYMOUS, async (db) =>
      (
        await db.query(
          `WITH q AS (SELECT to_tsquery('simple', string_agg(quote_literal(term),' | ')) AS value
        FROM unnest(tsvector_to_array(to_tsvector('simple',$1))) AS term)
       SELECT r.id FROM nexus.records r JOIN nexus.record_revisions v ON v.id=r.current_revision_id CROSS JOIN q
       WHERE r.id=ANY($2::uuid[]) AND r.state='published' AND nexus.can_read_revision(v.id)
       AND v.search_vector @@ q.value ORDER BY ts_rank_cd(v.search_vector,q.value) DESC,r.id LIMIT 5`,
          [task.query, ids],
        )
      ).rows.map((r: { id: string }) => r.id),
    );
    const actual = nexus.data.filter((r) => approved.has(String(r.id)));
    const target = task.expected_record ? recordId(task.expected_record) : null;
    const hit = target ? actual.some((r) => r.id === target) : null;
    const flatHit = target ? baseline.includes(target) : null;
    if (task.kind === 'answerable') {
      if (hit) summary.nexus_hit_at_5++;
      if (flatHit) summary.flat_keyword_hit_at_5++;
    } else if (task.kind === 'wrong_version') {
      if (!actual.length) summary.wrong_version_excluded++;
    } else if (!actual.length) summary.unknown_no_candidates++;
    results.push({
      id: task.id,
      kind: task.kind,
      nexus_ids: actual.map((r) => r.id),
      baseline_ids: baseline,
      nexus_hit_at_5: hit,
      flat_keyword_hit_at_5: flatHit,
      broader_keywords: actual.some((r) => r.retrieval === 'broader_keywords'),
      returned_bytes: nexus.returned_bytes,
    });
  }
  // Add 940 synthetic load records to this isolated 60-record database, never the demo.
  const content = {
    ...publicFixtures[0]!.content,
    title: 'Synthetic validation workload',
    problem: 'Authored numeric validation workload record for load measurement only.',
    intended_visibility: 'public',
  };
  await t.admin.query('BEGIN');
  try {
    await t.admin.query(
      `INSERT INTO nexus.records(id,owner_id)
      SELECT ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1::uuid FROM generate_series(1,940) n`,
      [t.owner.id],
    );
    await t.admin.query(
      `INSERT INTO nexus.record_revisions(id,record_id,sequence,content,digest,submitted)
      SELECT ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,$1::jsonb,$2,true FROM generate_series(1,940) n`,
      [JSON.stringify(content), digest(content)],
    );
    await t.admin.query(
      `INSERT INTO nexus.publication_grants(revision_id,owner_id,digest,visibility)
      SELECT id,$1::uuid,digest,'public' FROM nexus.record_revisions WHERE id::text LIKE '40000000-%'`,
      [t.owner.id],
    );
    await t.admin
      .query(`UPDATE nexus.records r SET current_revision_id=v.id,state='published',visibility='public'
      FROM nexus.record_revisions v WHERE v.record_id=r.id AND r.id::text LIKE '30000000-%'`);
    await t.admin.query('COMMIT');
  } catch (error) {
    await t.admin.query('ROLLBACK');
    throw error;
  }
  const count = Number((await t.admin.query('SELECT count(*) FROM nexus.records')).rows[0].count);
  assert.equal(count, 1000);
  await t.admin.query('ANALYZE nexus.records; ANALYZE nexus.record_revisions');
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const paths = [
    `/api/v1/search?${new URLSearchParams({ query: 'zero validation', environment: JSON.stringify({ runtime: 'node', version: '24.22.3' }), limit: '5' })}`,
    `/api/v1/records/${recordId(1)}`,
  ];
  const request = async (kind: number) => {
    const start = performance.now();
    const response = await fetch(base + paths[kind], { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    await response.json();
    return performance.now() - start;
  };
  const first = {
    search_ms: await request(0),
    get_ms: await request(1),
    note: 'First HTTP requests; database and OS caches were not flushed.',
  };
  const search: number[] = [],
    get: number[] = [];
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      for (let i = 0; i < 10; i++) {
        const kind = i % 2,
          ms = await request(kind);
        (kind === 0 ? search : get).push(ms);
      }
    }),
  );
  const stats = (values: number[]) => {
    values.sort((a, b) => a - b);
    return {
      requests: values.length,
      median_ms: Number(values[Math.floor(values.length / 2)]!.toFixed(2)),
      p95_ms: Number(values[Math.ceil(values.length * 0.95) - 1]!.toFixed(2)),
      max_ms: Number(values.at(-1)!.toFixed(2)),
    };
  };
  const result = {
    scope: manifest.scope,
    task_sha256: createHash('sha256').update(raw).digest('hex'),
    corpus_sha256: createHash('sha256').update(JSON.stringify(publicFixtures)).digest('hex'),
    summary,
    tasks: results,
    performance: {
      records: count,
      concurrent_clients: 10,
      first,
      warm_search: stats(search),
      warm_get: stats(get),
      database_cpu_limit: 2,
      database_memory_gib: 2,
      api_node: process.version,
      platform: `${process.platform}/${process.arch}`,
    },
    limitations: [
      'Post-implementation authored regression, not held-out validation.',
      'Keyword retrieval results are not model task success or appropriate abstention.',
      'Unknown questions can return broad matches with explicit limitations; requester relevance judgment remains necessary.',
      'Only the chosen cloud model has been exercised; no smaller-local-model comparison or incremental-value claim.',
    ],
  };
  await mkdir('.nexus/evaluations', { recursive: true, mode: 0o700 });
  await writeFile(
    '.nexus/evaluations/retrieval-pilot.json',
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ summary, performance: result.performance }));
} finally {
  await app.close();
  await t.close();
}

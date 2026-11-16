import { request as httpRequest } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createPool, tokenHash } from '../packages/db/index.js';
import { IDS, publicFixtures, recordId, revisionId } from '../fixtures/records.js';
import { runCloudAgent } from './ollama-agent.js';

if (!process.argv.includes('--demo-consent'))
  throw new Error(
    'Pass --demo-consent to simulate explicit approvals by synthetic local fixture owners.',
  );
interface Node {
  name: string;
  port: number;
  host: string;
  id: string;
  config: any;
  cookie?: string;
}
const load = async (name: 'north' | 'south'): Promise<Node> => {
  const root = resolve('.nexus/federation', name);
  const config = JSON.parse(await readFile(resolve(root, 'local.json'), 'utf8'));
  const pub = JSON.parse(await readFile(resolve(root, 'public-node.json'), 'utf8'));
  return { name, port: config.port, host: `${name}.localhost`, id: pub.node_id, config };
};
const north = await load('north'),
  south = await load('south');
const phases: { name: string; elapsed_ms: number; passed: true }[] = [];
const call = (
  node: Node,
  path: string,
  body?: unknown,
  cookie?: string,
  key?: string,
): Promise<{ status: number; body: any; cookies: string[] }> =>
  new Promise((accept, reject) => {
    const raw = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: node.port,
        path,
        method: raw ? 'POST' : 'GET',
        headers: {
          Host: `${node.host}:${node.port}`,
          Origin: `http://${node.host}:${node.port}`,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
          ...(raw
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 1048576) {
            res.destroy();
            reject(new Error('local_response_limit'));
          } else chunks.push(chunk);
        });
        res.once('end', () => {
          try {
            accept({
              status: res.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              cookies: res.headers['set-cookie'] ?? [],
            });
          } catch {
            reject(new Error('local_response_invalid'));
          }
        });
        res.once('error', () => reject(new Error('local_response_failed')));
      },
    );
    req.setTimeout(8000, () => req.destroy());
    req.once('error', () => reject(new Error('local_request_failed')));
    if (raw) req.write(raw);
    req.end();
  });
const ok = async (node: Node, path: string, body?: unknown, key?: string) => {
  const r = await call(node, path, body, node.cookie, key);
  if (r.status < 200 || r.status >= 300) throw new Error(`local_operation_failed_${r.status}`);
  return r.body;
};
async function signIn(node: Node, id: string) {
  const pool = createPool(node.config.admin_url),
    code = `nexus_login_${randomBytes(24).toString('hex')}`;
  try {
    await pool.query(
      "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'exchange',now()+interval '15 minutes')",
      [tokenHash(code), id, ['read', 'draft', 'outcome', 'review', 'publish', 'withdraw']],
    );
  } finally {
    await pool.end();
  }
  const r = await call(node, '/api/auth/exchange', { code });
  assert.equal(r.status, 200, 'Synthetic owner session failed');
  assert.equal(r.cookies.length, 1);
  node.cookie = r.cookies[0]!.split(';')[0]!;
}
async function waitFor<T>(fn: () => Promise<T | false>, label: string, ms = 12000): Promise<T> {
  const started = Date.now();
  do {
    const value = await fn();
    if (value !== false) {
      const elapsed_ms = Date.now() - started;
      phases.push({ name: label, elapsed_ms, passed: true });
      console.log(JSON.stringify({ phase: label, elapsed_ms, passed: true }));
      return value;
    }
    await new Promise((r) => setTimeout(r, 400));
  } while (Date.now() - started < ms);
  throw new Error(`deadline_${label}`);
}
async function publish(node: Node, content: any, existing?: string) {
  const draft = await ok(
    node,
    existing ? `/api/v1/records/${existing}/revisions` : '/api/v1/drafts',
    { content, intended_visibility: 'public' },
    randomUUID(),
  );
  await ok(
    node,
    `/api/v1/drafts/${draft.id}/submit`,
    { revision_id: draft.revision_id },
    randomUUID(),
  );
  await waitFor(async () => {
    const row = await ok(node, `/api/v1/records/${draft.id}`);
    return row.state === 'reviewable' ? row : false;
  }, 'review_worker_' + node.name);
  await ok(node, '/api/v1/reviews', {
    record_id: draft.id,
    revision_id: draft.revision_id,
    digest: draft.digest,
    decision: 'approved',
    note: 'Synthetic owner review for the local federation demonstration.',
  });
  await ok(node, '/api/v1/publications', {
    record_id: draft.id,
    revision_id: draft.revision_id,
    digest: draft.digest,
    visibility: 'public',
    confirmed: true,
  });
  await ok(node, '/api/v1/assessments', {
    record_id: draft.id,
    revision_id: draft.revision_id,
    method: 'source_review',
    outcome: 'not_run',
    environment: content.environment,
    note: 'Authored computation example; no independent execution or scientific replication is claimed.',
    affiliation: 'AiRC Nexus local demonstration',
    independence: 'not_claimed',
  });
  return draft;
}
const share = (source: Node, target: Node, row: any, enabled = true) =>
  ok(source, '/api/v1/federation/exports', {
    record_id: row.id,
    revision_id: row.revision_id,
    digest: row.digest,
    peer_id: target.id,
    enabled,
    confirmed: true,
  });
async function pending(target: Node, source: Node, id: string) {
  return waitFor(
    async () => {
      const state = await ok(target, '/api/v1/federation');
      return (
        state.records.find(
          (r: any) => r.peer_id === source.id && r.record_id === id && r.payload && !r.approved,
        ) || false
      );
    },
    'public_snapshot_' + source.name + '_to_' + target.name,
  );
}
const approve = (target: Node, row: any) =>
  ok(target, '/api/v1/federation/approvals', {
    peer_id: row.peer_id,
    record_id: row.record_id,
    revision_id: row.revision_id,
    artifact_digest: row.artifact_digest,
    accepted: true,
    confirmed: true,
  });
const remote = (node: Node, source: Node, id: string, revision?: string) =>
  call(
    node,
    `/api/v1/federation/records/${source.id}/${id}${revision ? `?revision=${revision}` : ''}`,
  );
async function gone(target: Node, source: Node, id: string, label: string) {
  return waitFor(
    async () => ((await remote(target, source, id)).status === 404 ? true : false),
    label,
  );
}
const clients: Client[] = [];
async function clientFor(node: Node) {
  const c = new Client(
    { name: 'nexus-live-federation-acceptance', version: '0.2.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  clients.push(c);
  await c.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/apps/mcp/main.js')],
      env: {
        PATH: process.env.PATH ?? '',
        NEXUS_URL: `http://127.0.0.1:${node.port}`,
        NEXUS_TOKEN_FILE: resolve('.nexus/federation', node.name, 'agent.token'),
      },
      stderr: 'pipe',
    }),
  );
  return c;
}
const json = (result: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse(
    result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n'),
  );
await mkdir('.nexus/evaluations', { recursive: true, mode: 0o700 });
const result: any = {
  scope:
    'Two separate local Node/PostgreSQL services and credentials, one Mac/operator; synthetic owner consent; no independent-institution or scientific replication claim.',
  phases,
};
try {
  await signIn(north, IDS.alice);
  await signIn(south, IDS.bob);
  const roleChecks = [];
  for (const node of [north, south]) {
    for (const [key, role] of [
      ['app_url', 'nexus_app'],
      ['worker_url', 'nexus_worker'],
      ['federation_url', 'nexus_federation'],
    ] as const) {
      const pool = createPool(node.config[key]);
      try {
        const r = (
          await pool.query(
            'SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',
          )
        ).rows[0];
        assert.equal(r.current_user, role);
        assert.equal(r.rolsuper, false);
        assert.equal(r.rolbypassrls, false);
        roleChecks.push({ node: node.name, role, restricted: true });
      } finally {
        await pool.end();
      }
    }
  }
  const wrongUrl = new URL(south.config.app_url);
  wrongUrl.password = new URL(north.config.app_url).password;
  const wrong = createPool(wrongUrl.toString());
  try {
    await assert.rejects(wrong.query('SELECT 1'));
  } finally {
    await wrong.end();
  }
  result.roles = roleChecks;
  result.cross_database_credential_rejected = true;
  const base = publicFixtures[30]!.content;
  const initial = await publish(north, {
    ...base,
    title: 'Federation validation — synthetic variance',
  });
  await ok(south, '/api/v1/federation/peer-consent', {
    peer_id: north.id,
    import_enabled: true,
    confirmed: true,
  });
  assert.equal((await remote(south, north, initial.id)).status, 404);
  for (const number of [101, 106]) {
    const row = await ok(north, `/api/v1/records/${recordId(number)}`);
    const denied = await call(
      north,
      '/api/v1/federation/exports',
      {
        record_id: row.id,
        revision_id: revisionId(number),
        digest: row.digest,
        peer_id: south.id,
        enabled: true,
        confirmed: true,
      },
      north.cookie,
    );
    assert.equal(denied.status, 409);
  }
  result.private_and_team_exports_denied = true;
  await share(north, south, initial);
  const first = await pending(south, north, initial.id);
  assert.equal((await remote(south, north, initial.id)).status, 404);
  await approve(south, first);
  assert.equal((await remote(south, north, initial.id)).status, 200);
  await share(north, south, initial, false);
  await gone(south, north, initial.id, 'source_consent_revocation');
  await share(north, south, initial);
  await approve(south, await pending(south, north, initial.id));
  await ok(south, '/api/v1/federation/peer-consent', {
    peer_id: north.id,
    import_enabled: false,
    confirmed: true,
  });
  assert.equal((await remote(south, north, initial.id)).status, 404);
  await ok(south, '/api/v1/federation/peer-consent', {
    peer_id: north.id,
    import_enabled: true,
    confirmed: true,
  });
  await approve(south, await pending(south, north, initial.id));
  result.receiving_opt_out_immediate = true;

  // Stop only this task's North API. South's independent verifier must remove availability.
  const pids = JSON.parse(await readFile('.nexus/federation/processes.json', 'utf8'));
  const cmd = spawnSync('ps', ['-p', String(pids['north-server']), '-o', 'args='], {
    encoding: 'utf8',
  }).stdout;
  assert.ok(cmd.includes(resolve('dist/apps/server/main.js')) && cmd.includes('--nexus-instance='));
  process.kill(pids['north-server'], 'SIGTERM');
  try {
    await gone(south, north, initial.id, 'source_outage');
  } finally {
    const restarted = spawnSync(process.execPath, ['scripts/federation-demo.mjs'], {
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.equal(restarted.status, 0, 'Task-owned federation restart failed');
  }
  await approve(south, await pending(south, north, initial.id));
  result.service_restart_and_reapproval = true;

  const correctedContent = {
    ...base,
    title: 'Federation validation — corrected variance convention',
  };
  const correction = await ok(
    north,
    `/api/v1/records/${initial.id}/revisions`,
    { content: correctedContent, intended_visibility: 'public' },
    randomUUID(),
  );
  await gone(south, north, initial.id, 'private_correction_hides_old_revision');
  assert.equal((await remote(south, north, initial.id, initial.revision_id)).status, 404);
  await ok(
    north,
    `/api/v1/drafts/${initial.id}/submit`,
    { revision_id: correction.revision_id },
    randomUUID(),
  );
  await waitFor(
    async () =>
      (await ok(north, `/api/v1/records/${initial.id}`)).state === 'reviewable' ? true : false,
    'correction_screening',
  );
  await ok(north, '/api/v1/reviews', {
    record_id: initial.id,
    revision_id: correction.revision_id,
    digest: correction.digest,
    decision: 'approved',
    note: 'Synthetic correction review.',
  });
  await ok(north, '/api/v1/publications', {
    record_id: initial.id,
    revision_id: correction.revision_id,
    digest: correction.digest,
    visibility: 'public',
    confirmed: true,
  });
  assert.equal((await remote(south, north, initial.id)).status, 404);
  await share(north, south, correction);
  const next = await pending(south, north, initial.id);
  assert.equal(next.approved, false);
  await approve(south, next);
  assert.equal((await remote(south, north, initial.id)).body.sequence, 2);
  await ok(north, `/api/v1/records/${initial.id}/withdraw`, {});
  await gone(south, north, initial.id, 'withdrawal');
  result.correction_requires_both_new_approvals = true;
  result.old_revision_unavailable = true;

  // Leave a separate, explicitly shared showcase; never undo the preceding withdrawal.
  const showcase = await publish(north, {
    ...base,
    title: 'Variance conventions across a shared commons',
  });
  await share(north, south, showcase);
  await approve(south, await pending(south, north, showcase.id));
  const returning = await publish(south, {
    ...publicFixtures[33]!.content,
    title: 'Returning histogram method for a shared commons',
  });
  await ok(north, '/api/v1/federation/peer-consent', {
    peer_id: south.id,
    import_enabled: true,
    confirmed: true,
  });
  await share(south, north, returning);
  await approve(north, await pending(north, south, returning.id));
  result.bilateral_public_sharing = true;
  const requester = await clientFor(south);
  const query = await requester.callTool({
    name: 'nexus_search',
    arguments: {
      query: 'variance conventions',
      profile: 'computational_method',
      environment: { dataset: 'nexus-synthetic-v1' },
      include_federated: true,
      limit: 1,
    },
  });
  assert.notEqual(query.isError, true);
  assert.equal(json(query).data[0].id, showcase.id);
  assert.equal(json(query).data[0].origin_node, north.id);
  const report = await requester.callTool({
    name: 'nexus_report_outcome',
    arguments: {
      idempotency_key: randomUUID(),
      outcome: {
        origin_node: north.id,
        record_id: showcase.id,
        revision_id: showcase.revision_id,
        outcome: 'not_run',
        note: 'Live separate-node MCP retrieval passed. No submitted code or independent scientific replication was executed.',
      },
    },
  });
  assert.notEqual(report.isError, true);
  assert.equal(json(report).visibility, 'private');
  assert.equal((await call(south, '/api/v1/federation')).body.outcomes.length, 0);
  assert.ok((await ok(south, '/api/v1/federation')).outcomes.length > 0);
  const reverseClient = await clientFor(north);
  const reverse = await reverseClient.callTool({
    name: 'nexus_get',
    arguments: { origin_node: south.id, id: returning.id, revision_id: returning.revision_id },
  });
  assert.notEqual(reverse.isError, true);
  assert.equal(json(reverse).data[0].origin_node, south.id);
  result.mcp = {
    protocol: requester.getNegotiatedProtocolVersion(),
    forward_and_reverse_read: true,
    private_outcome: true,
  };
  if (process.argv.includes('--cloud')) {
    try {
      const run = await runCloudAgent(
        requester,
        'Find the authored shared variance-conventions method from Northern Commons using include_federated:true, environment dataset nexus-synthetic-v1, limit 1, budget_bytes 4000. Then read its exact revision with nexus_get and its origin_node. Report its source, method and limits. No tests were executed by you. Return JSON with status, summary, origin_node, record_id, revision_id, tested:false.',
        ['nexus_search', 'nexus_get'],
        {
          filterResult: (_name, value) => {
            const data = value as any;
            return data.data
              ? {
                  ...data,
                  data: data.data.filter(
                    (r: any) =>
                      r.id === showcase.id && (r.federated === true || r.visibility === 'public'),
                  ),
                }
              : value;
          },
        },
      );
      const answer = run.final as any;
      assert.equal(answer.record_id, showcase.id);
      assert.equal(answer.revision_id, showcase.revision_id);
      assert.equal(answer.origin_node, north.id);
      assert.equal(answer.tested, false);
      assert.ok(run.tool_calls.some((t) => t.name === 'nexus_search' && t.ok));
      assert.ok(run.tool_calls.some((t) => t.name === 'nexus_get' && t.ok));
      result.cloud = {
        passed: true,
        ...run,
        scope:
          'One selected DeepSeek cloud requester, authored public two-node context, not a smaller-model comparison or scientific validation.',
      };
    } catch (error) {
      result.cloud = {
        passed: false,
        error: error instanceof Error ? error.message : 'cloud_check_failed',
      };
    }
  }
  const refs = {
    north: { node_id: north.id, record_id: showcase.id, revision_id: showcase.revision_id },
    south: { node_id: south.id, record_id: returning.id, revision_id: returning.revision_id },
    withdrawn_test: { record_id: initial.id, revision_id: correction.revision_id },
  };
  await writeFile('.nexus/federation/showcase.json', JSON.stringify(refs, null, 2) + '\n', {
    mode: 0o600,
  });
  result.passed = true;
  result.references = refs;
  result.sample =
    'One live authored bilateral scenario; measured polling phases are not an Internet SLA.';
  await writeFile(
    '.nexus/evaluations/federation-live.json',
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      passed: true,
      bilateral_sharing: true,
      private_and_team_exports_denied: true,
      source_consent_revocation: true,
      correction_and_withdrawal: true,
      source_outage: true,
      private_mcp_outcome: true,
      cloud: result.cloud
        ? {
            passed: result.cloud.passed,
            model: result.cloud.model,
            input_tokens: result.cloud.input_tokens,
            output_tokens: result.cloud.output_tokens,
            error: result.cloud.error,
          }
        : undefined,
    }),
  );
} catch (error) {
  await writeFile(
    '.nexus/evaluations/federation-live-error.json',
    JSON.stringify(
      {
        passed: false,
        error: error instanceof Error ? error.message : 'live_check_failed',
        phases,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.error('Live federation acceptance failed; see the bounded private result.');
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((c) => c.close()));
  for (const node of [north, south])
    if (node.cookie)
      try {
        await call(node, '/api/auth/logout', {}, node.cookie);
      } catch {}
}

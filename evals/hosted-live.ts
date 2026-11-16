import { request } from 'node:https';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { publicFixtures } from '../fixtures/records.js';

interface Node {
  name: string;
  origin: string;
  login_file: string;
  agent_file: string;
  team_file: string;
  cookie?: string;
  node_id?: string;
  operator_id?: string;
}
const input = process.argv[2];
if (!input || !process.argv.includes('--authored-test-consent'))
  throw new Error('Supply a private acceptance configuration and --authored-test-consent.');
const config = JSON.parse(await readFile(input, 'utf8')) as { ca_file: string; nodes: Node[] };
assert.equal(config.nodes.length, 2);
const [a, b] = config.nodes as [Node, Node],
  ca = await readFile(config.ca_file);
const phases: { name: string; elapsed_ms: number; passed: true }[] = [],
  clients: Client[] = [];
const result: any = {
  scope:
    'Two separate HTTPS hosts and unique logical operators, administered by one project owner. Authored fixtures only; no independent institution or scientific replication claim.',
  phases,
};

function call(
  node: Node,
  path: string,
  body?: unknown,
  authenticated = false,
  key?: string,
  extra: Record<string, string> = {},
) {
  return new Promise<{ status: number; body: any; cookies: string[] }>((accept, reject) => {
    const raw = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      new URL(path, node.origin),
      {
        ca,
        rejectUnauthorized: true,
        method: raw ? 'POST' : 'GET',
        headers: {
          Origin: node.origin,
          Connection: 'close',
          ...(authenticated && node.cookie ? { Cookie: node.cookie } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
          ...(raw
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(raw)),
              }
            : {}),
          ...extra,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 1048576) req.destroy();
          else chunks.push(c);
        });
        res.once('end', () => {
          clearTimeout(timer);
          try {
            accept({
              status: res.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              cookies: res.headers['set-cookie'] ?? [],
            });
          } catch {
            reject(new Error('host_response_invalid'));
          }
        });
        res.once('error', () => {
          clearTimeout(timer);
          reject(new Error('host_response_failed'));
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('host_request_deadline'));
    }, 8000);
    timer.unref();
    req.once('error', () => {
      clearTimeout(timer);
      reject(new Error('host_request_failed'));
    });
    if (raw) req.write(raw);
    req.end();
  });
}
async function ok(node: Node, path: string, body?: unknown, key?: string) {
  const r = await call(node, path, body, true, key);
  assert.ok(r.status >= 200 && r.status < 300, `host_operation_${r.status}`);
  return r.body;
}
async function wait<T>(fn: () => Promise<T | false>, name: string): Promise<T> {
  const start = Date.now();
  do {
    const value = await fn();
    if (value !== false) {
      const row = { name, elapsed_ms: Date.now() - start, passed: true as const };
      phases.push(row);
      console.log(JSON.stringify(row));
      return value;
    }
    await new Promise((r) => setTimeout(r, 400));
  } while (Date.now() - start < 15000);
  throw new Error(`deadline_${name}`);
}
async function login(node: Node) {
  const { code } = JSON.parse(await readFile(node.login_file, 'utf8'));
  const r = await call(node, '/api/auth/exchange', { code });
  assert.equal(r.status, 200, 'Operator sign-in failed');
  assert.equal(r.cookies.length, 1);
  assert.ok(
    r.cookies[0]!.includes('Secure') &&
      r.cookies[0]!.includes('HttpOnly') &&
      r.cookies[0]!.startsWith('__Host-nexus_'),
  );
  node.cookie = r.cookies[0]!.split(';')[0]!;
  const me = await ok(node, '/api/me');
  node.operator_id = me.user.id;
  assert.equal(me.user.kind, 'human');
  node.node_id = (await ok(node, '/api/v1/node')).node_id;
}
async function create(node: Node, title: string, visibility = 'public', existing?: string) {
  const content = { ...publicFixtures[30]!.content, title };
  const team =
    visibility === 'team' ? JSON.parse(await readFile(node.team_file, 'utf8')).team_id : undefined;
  const draft = await ok(
    node,
    existing ? `/api/v1/records/${existing}/revisions` : '/api/v1/drafts',
    { content, intended_visibility: visibility, ...(team ? { team_id: team } : {}) },
    randomUUID(),
  );
  return { ...draft, content };
}
async function publish(node: Node, row: any, visibility = 'public') {
  await ok(node, `/api/v1/drafts/${row.id}/submit`, { revision_id: row.revision_id }, randomUUID());
  await wait(
    async () =>
      (await ok(node, `/api/v1/records/${row.id}`)).state === 'reviewable' ? true : false,
    'screen_' + node.name,
  );
  await ok(node, '/api/v1/reviews', {
    record_id: row.id,
    revision_id: row.revision_id,
    digest: row.digest,
    decision: 'approved',
    note: 'Authored cross-host validation; owner reviewed exact source/scope.',
  });
  await ok(node, '/api/v1/publications', {
    record_id: row.id,
    revision_id: row.revision_id,
    digest: row.digest,
    visibility,
    confirmed: true,
  });
}
const share = (source: Node, target: Node, row: any, enabled = true) =>
  ok(source, '/api/v1/federation/exports', {
    record_id: row.id,
    revision_id: row.revision_id,
    digest: row.digest,
    peer_id: target.node_id,
    enabled,
    confirmed: true,
  });
async function pending(target: Node, source: Node, row: any) {
  return wait(
    async () => {
      const view = await ok(target, '/api/v1/federation');
      return (
        view.records.find(
          (r: any) =>
            r.peer_id === source.node_id &&
            r.record_id === row.id &&
            r.revision_id === row.revision_id &&
            r.payload &&
            !r.approved,
        ) || false
      );
    },
    'snapshot_' + source.name + '_to_' + target.name,
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
const get = (target: Node, source: Node, row: any) =>
  call(
    target,
    `/api/v1/federation/records/${source.node_id}/${row.id}?revision=${row.revision_id}`,
  );
const gone = (target: Node, source: Node, row: any, name: string) =>
  wait(async () => ((await get(target, source, row)).status === 404 ? true : false), name);
async function mcp(node: Node) {
  const client = new Client(
    { name: 'nexus-https-host-acceptance', version: '0.3.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  clients.push(client);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/apps/mcp/main.js')],
      env: {
        PATH: process.env.PATH ?? '',
        NEXUS_URL: node.origin,
        NEXUS_TOKEN_FILE: resolve(node.agent_file),
        NEXUS_CA_FILE: resolve(config.ca_file),
      },
      stderr: 'pipe',
    }),
  );
  return client;
}
const data = (r: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse(
    r.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n'),
  );
await mkdir('.nexus/hosted/evidence', { recursive: true, mode: 0o700 });
try {
  await login(a);
  await login(b);
  assert.notEqual(a.operator_id, b.operator_id);
  assert.notEqual(a.node_id, b.node_id);
  result.separate_operators = true;
  result.separate_nodes = true;
  result.secure_sessions = true;
  const wrong = (await readFile(a.agent_file, 'utf8')).trim();
  assert.equal(
    (await call(b, '/api/me', undefined, false, undefined, { Authorization: `Bearer ${wrong}` }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        b,
        '/api/v1/federation/peer-consent',
        { peer_id: a.node_id, import_enabled: true, confirmed: true },
        true,
        undefined,
        { Origin: a.origin },
      )
    ).status,
    403,
  );
  result.cross_node_credentials_and_origin_rejected = true;
  const privateRows = [];
  for (const [node, other, visibility] of [
    [a, b, 'private'],
    [a, b, 'team'],
    [b, a, 'private'],
  ] as const) {
    const sentinel = `host-local-${randomUUID()}`,
      row = await create(node, sentinel, visibility);
    await publish(node, row, visibility);
    const denied = await call(
      node,
      '/api/v1/federation/exports',
      {
        record_id: row.id,
        revision_id: row.revision_id,
        digest: row.digest,
        peer_id: other.node_id,
        enabled: true,
        confirmed: true,
      },
      true,
    );
    assert.equal(denied.status, 409);
    assert.equal((await get(other, node, row)).status, 404);
    assert.equal((await call(node, `/api/v1/records/${row.id}`)).status, 404);
    assert.equal((await ok(node, `/api/v1/records/${row.id}`)).content.title, sentinel);
    assert.ok(!JSON.stringify((await call(other, '/api/v1/federation')).body).includes(sentinel));
    privateRows.push({ node: node.name, id: row.id, title: sentinel, visibility });
  }
  result.private_team_stay_local = true;
  const first = await create(a, 'Cross-host variance method — validation');
  await publish(a, first);
  await ok(b, '/api/v1/federation/peer-consent', {
    peer_id: a.node_id,
    import_enabled: true,
    confirmed: true,
  });
  assert.equal((await get(b, a, first)).status, 404);
  await share(a, b, first);
  const candidate = await pending(b, a, first);
  assert.equal((await get(b, a, first)).status, 404);
  await approve(b, candidate);
  assert.equal((await get(b, a, first)).status, 200);
  await share(a, b, first, false);
  await gone(b, a, first, 'source_opt_out');
  await share(a, b, first);
  await approve(b, await pending(b, a, first));
  await ok(b, '/api/v1/federation/peer-consent', {
    peer_id: a.node_id,
    import_enabled: false,
    confirmed: true,
  });
  assert.equal((await get(b, a, first)).status, 404);
  await ok(b, '/api/v1/federation/peer-consent', {
    peer_id: a.node_id,
    import_enabled: true,
    confirmed: true,
  });
  await approve(b, await pending(b, a, first));
  const correction = await create(a, 'Cross-host variance method — corrected', 'public', first.id);
  await gone(b, a, first, 'private_correction_removes_old');
  await publish(a, correction);
  assert.equal((await get(b, a, correction)).status, 404);
  await share(a, b, correction);
  const next = await pending(b, a, correction);
  assert.equal(next.approved, false);
  await approve(b, next);
  assert.equal((await get(b, a, correction)).body.sequence, 2);
  assert.equal((await get(b, a, first)).status, 404);
  await ok(a, `/api/v1/records/${first.id}/withdraw`, {});
  await gone(b, a, correction, 'withdrawal_removes_current');
  result.source_and_recipient_opt_in = true;
  result.correction_requires_fresh_both_approvals = true;
  result.withdrawal = true;
  const showcaseA = await create(a, 'A shared variance convention over HTTPS');
  await publish(a, showcaseA);
  await share(a, b, showcaseA);
  await approve(b, await pending(b, a, showcaseA));
  const showcaseB = await create(b, 'A returning scientific example over HTTPS');
  await publish(b, showcaseB);
  await ok(a, '/api/v1/federation/peer-consent', {
    peer_id: b.node_id,
    import_enabled: true,
    confirmed: true,
  });
  await share(b, a, showcaseB);
  await approve(a, await pending(a, b, showcaseB));
  const clientB = await mcp(b),
    read = await clientB.callTool({
      name: 'nexus_get',
      arguments: { origin_node: a.node_id, id: showcaseA.id, revision_id: showcaseA.revision_id },
    });
  assert.notEqual(read.isError, true);
  assert.equal(data(read).data[0].origin_node, a.node_id);
  const note = `private-outcome-${randomUUID()}`,
    saved = await clientB.callTool({
      name: 'nexus_report_outcome',
      arguments: {
        idempotency_key: randomUUID(),
        outcome: {
          origin_node: a.node_id,
          record_id: showcaseA.id,
          revision_id: showcaseA.revision_id,
          outcome: 'not_run',
          note,
        },
      },
    });
  assert.notEqual(saved.isError, true);
  assert.equal(data(saved).visibility, 'private');
  assert.ok((await ok(b, '/api/v1/federation')).outcomes.some((r: any) => r.note === note));
  assert.ok(!JSON.stringify((await call(a, '/api/v1/federation')).body).includes(note));
  assert.ok(!JSON.stringify((await call(b, '/api/v1/federation')).body).includes(note));
  const clientA = await mcp(a),
    reverse = await clientA.callTool({
      name: 'nexus_get',
      arguments: { origin_node: b.node_id, id: showcaseB.id, revision_id: showcaseB.revision_id },
    });
  assert.notEqual(reverse.isError, true);
  assert.equal(data(reverse).data[0].origin_node, b.node_id);
  result.bilateral_https_mcp = true;
  result.private_reports_local = true;
  result.protocol = clientB.getNegotiatedProtocolVersion();
  for (const node of [a, b]) {
    const view = await ok(node, '/api/v1/federation');
    for (const p of privateRows)
      if (p.node !== node.name) assert.ok(!JSON.stringify(view.records).includes(p.title));
  }
  await writeFile(
    '.nexus/hosted/evidence/private-assertions.json',
    JSON.stringify(
      { private_rows: privateRows, private_outcome_node: b.name, private_outcome: note },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  await writeFile(
    '.nexus/hosted/showcases.json',
    JSON.stringify(
      {
        nodes: [
          {
            name: a.name,
            node_id: a.node_id,
            operator_id: a.operator_id,
            record_id: showcaseA.id,
            revision_id: showcaseA.revision_id,
          },
          {
            name: b.name,
            node_id: b.node_id,
            operator_id: b.operator_id,
            record_id: showcaseB.id,
            revision_id: showcaseB.revision_id,
          },
        ],
        withdrawn: {
          origin_node: a.node_id,
          record_id: first.id,
          revision_id: correction.revision_id,
        },
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  result.passed = true;
  await writeFile('.nexus/hosted/evidence/live.json', JSON.stringify(result, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      passed: true,
      separate_hosts: true,
      separate_operators: true,
      private_team_stay_local: true,
      bilateral_https_mcp: true,
      correction_and_withdrawal: true,
      private_reports_local: true,
    }),
  );
} catch (error) {
  await writeFile(
    '.nexus/hosted/evidence/live-error.json',
    JSON.stringify(
      {
        passed: false,
        error: error instanceof Error ? error.message : 'acceptance_failed',
        phases,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.error('Cross-host HTTPS acceptance failed; bounded diagnostics retained privately.');
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((c) => c.close()));
  for (const node of [a, b])
    if (node.cookie)
      try {
        await call(node, '/api/auth/logout', {}, true);
      } catch {}
}

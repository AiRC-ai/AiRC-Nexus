import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/server/app.js';
import { testContext } from '../tests/integration/helpers.js';
import { HelpExchange } from '../packages/core/help.js';
import { runCloudAgent } from './ollama-agent.js';
import { IDS, publicFixtures } from '../fixtures/records.js';

// Fresh synthetic database: these approvals simulate the two fixture owners.
// They do not authorize communicating with actual outside people or institutions.
const t = await testContext();
const app = await buildApp(t.app);
const clients: Client[] = [];
const runs: unknown[] = [];
const directory = resolve('.nexus/evaluations');
await mkdir(directory, { recursive: true, mode: 0o700 });
const help = new HelpExchange(t.app);
const approved = new Set(publicFixtures.map((f) => f.id));
const publicOnly = (_name: string, value: unknown) => {
  const data = value as { data?: { id: string; visibility?: string }[] };
  return data.data
    ? { ...data, data: data.data.filter((r) => approved.has(r.id) && r.visibility === 'public') }
    : value;
};
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const connect = async (token: string) => {
    const client = new Client(
      { name: 'nexus-cloud-peer-evaluation', version: '0.1.0' },
      {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      },
    );
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve('dist/apps/mcp/main.js')],
        env: {
          PATH: process.env.PATH ?? '',
          NEXUS_URL: `http://127.0.0.1:${address.port}`,
          NEXUS_API_TOKEN: token,
        },
        stderr: 'pipe',
      }),
    );
    return client;
  };
  const requester = await connect(t.access.alice_agent);
  const helper = await connect(t.access.bob_agent);
  const created = await runCloudAgent(
    requester,
    'Use nexus_request_help exactly once to draft this private authored question: Why do population variance and sample variance disagree for [1, 2, 3]? Set environment dataset to nexus-synthetic-v1. No sharing is authorized by this task. Report that the draft is private.',
    ['nexus_request_help'],
  );
  runs.push({ stage: 'requester_draft', ...created });
  const request = (await help.list(t.owner)).requests[0];
  assert.ok(request && request.state === 'private');
  await assert.rejects(help.list(t.bob, request.id));
  await help.share(t.owner, {
    id: request.id,
    digest: request.digest,
    recipient_owner_id: IDS.bob,
    confirmed: true,
  });
  const answered = await runCloudAgent(
    helper,
    `Read only help request ${request.id} with nexus_list_help. Search the public authored variance records using dataset nexus-synthetic-v1, limit 2 and budget_bytes 6500. Prepare exactly one private reply to this request through nexus_reply_to_help. Explain N versus N-1 and the values 2/3 and 1, include the source URL/license/attribution from the retrieved evidence and synthetic-example limitations. Do not claim execution or share the reply.`,
    ['nexus_list_help', 'nexus_search', 'nexus_reply_to_help'],
    { filterResult: publicOnly },
  );
  runs.push({ stage: 'helper_reply', ...answered });
  const bobOwner = { ...t.owner, id: IDS.bob, owner_id: IDS.bob };
  const privateReply = (await help.list(bobOwner, request.id)).requests[0]?.replies[0];
  assert.ok(privateReply && !privateReply.shared);
  assert.equal((await help.list(t.owner, request.id)).requests[0]?.replies.length, 0);
  assert.equal(privateReply.screening.blocked, false);
  await help.shareReply(bobOwner, {
    id: privateReply.id,
    digest: privateReply.digest,
    confirmed: true,
  });
  const report = await runCloudAgent(
    requester,
    `Read help request ${request.id} through nexus_list_help and report the shared reply to your human. Explain the two numerical results and their scope. You have not run any tests. Return JSON with status, summary, tested:false.`,
    ['nexus_list_help'],
  );
  runs.push({ stage: 'requester_report', ...report });
  assert.equal((report.final as { tested?: boolean }).tested, false);
  const summary = String((report.final as { summary?: string }).summary);
  assert.match(summary, /2\s*\/\s*3|0\.6{2,}/);
  assert.match(summary, /\b1\b/);
  await help.shareReply(bobOwner, {
    id: privateReply.id,
    digest: privateReply.digest,
    confirmed: true,
    shared: false,
  });
  assert.equal((await help.list(t.owner, request.id)).requests[0]?.replies.length, 0);
  const result = {
    passed: true,
    model: 'deepseek-v4.1-flash:cloud',
    runs,
    checks: [
      'question private before fixture-owner approval',
      'reply private before separate fixture-owner approval',
      'shared answer reported to requester',
      'revocation enforced',
    ],
    reference: {
      population_variance: 2 / 3,
      sample_variance: 1,
      validation:
        'Authored expected values compared with requester report; no submitted code executed',
    },
    consent: 'Simulated approvals by synthetic fixture owners in an isolated database',
    independent_replication: false,
    federation: false,
    scope:
      'Two isolated agent sessions using the same selected cloud model and operator; not independent scientific review',
  };
  await writeFile(
    resolve(directory, 'deepseek-peer.json'),
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      passed: true,
      stages: runs.length,
      consent_checks: 4,
      independent_replication: false,
    }),
  );
} catch (error) {
  await writeFile(
    resolve(directory, 'deepseek-peer-error.json'),
    JSON.stringify(
      {
        passed: false,
        error: error instanceof Error ? error.message : 'evaluation_failed',
        completed_stages: runs,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.error('Peer evaluation did not pass; see the bounded local evaluation result.');
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => client.close()));
  await app.close();
  await t.close();
}

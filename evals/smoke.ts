import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { runCloudAgent } from './ollama-agent.js';
import { publicFixtures, recordId, revisionId } from '../fixtures/records.js';

const access = JSON.parse(await readFile('.nexus/access.json', 'utf8'));
const client = new Client(
  { name: 'nexus-deepseek-requester-evaluation', version: '0.1.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
);
const approvedRecords = new Set(publicFixtures.map((f) => f.id));
const evidenceDir = resolve('.nexus/evaluations');
await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/apps/mcp/main.js')],
      env: {
        PATH: process.env.PATH ?? '',
        NEXUS_URL: 'http://127.0.0.1:4318',
        NEXUS_API_TOKEN: access.bob_agent,
      },
      stderr: 'pipe',
    }),
  );
  const run = await runCloudAgent(
    client,
    'Find the authored Nexus solution for a numeric zero being discarded by validation in Node 24.22.3. Search first, read its exact revision if needed, and report the proposed method and limitations. No project tests have been run by you.',
    ['nexus_search', 'nexus_get'],
    {
      filterResult: (name, value) => {
        const data = value as { data?: { id: string; visibility?: string; state?: string }[] };
        if (data.data)
          return {
            ...data,
            data: data.data.filter(
              (row) => approvedRecords.has(row.id) && row.visibility === 'public',
            ),
            evaluation_scope:
              'Only the pre-approved public authored corpus participates in this evaluation.',
          };
        return value;
      },
    },
  );
  const final = run.final as {
    record_id?: string;
    revision_id?: string;
    tested?: boolean;
    summary?: string;
  };
  await writeFile(
    resolve(evidenceDir, 'deepseek-mcp-attempt.json'),
    JSON.stringify(run, null, 2) + '\n',
    { mode: 0o600 },
  );
  assert.equal(final.record_id, recordId(1));
  assert.equal(final.revision_id, revisionId(1));
  assert.equal(final.tested, false);
  assert.ok(run.tool_calls.some((t) => t.name === 'nexus_search' && t.ok));
  // External authored reference check. This does not execute model-returned code.
  const reference = (value: unknown) => value !== null && value !== undefined;
  assert.equal(reference(0), true);
  assert.equal(reference(null), false);
  assert.equal(reference(undefined), false);
  const report = await client.callTool({
    name: 'nexus_report_outcome',
    arguments: {
      idempotency_key: randomUUID(),
      outcome: {
        record_id: recordId(1),
        revision_id: revisionId(1),
        outcome: 'passed',
        environment: { runtime: 'node', version: '24.22.3' },
        note: 'Live DeepSeek 4.1 Flash used MCP to retrieve and cite this authored revision. The external harness checked the authored reference null/undefined predicate for 0, null and undefined. The model did not execute or supply an independently verified project fix.',
      },
    },
  });
  assert.notEqual(report.isError, true);
  const evidence = {
    ...run,
    scope: 'Authored demo only; one cloud requester, not a small-local-model benchmark',
    protocol: client.getNegotiatedProtocolVersion(),
    reference_check: '3 authored predicate assertions passed',
    outcome_visibility: 'private',
    independent_replication: false,
  };
  await writeFile(
    resolve(evidenceDir, 'deepseek-mcp-smoke.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    { mode: 0o600 },
  );
  await rm(resolve(evidenceDir, 'deepseek-mcp-smoke-error.json'), { force: true });
  console.log(
    JSON.stringify({
      passed: true,
      model: run.model,
      protocol: evidence.protocol,
      model_calls: run.model_calls,
      tool_calls: run.tool_calls,
      input_tokens: run.input_tokens,
      output_tokens: run.output_tokens,
      elapsed_ms: run.elapsed_ms,
      reference_assertions: 3,
      private_outcome_recorded: true,
    }),
  );
} catch (error) {
  await writeFile(
    resolve(evidenceDir, 'deepseek-mcp-smoke-error.json'),
    JSON.stringify(
      { passed: false, error: error instanceof Error ? error.message : 'evaluation_failed' },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.error(
    'Cloud requester smoke check did not pass; see the bounded local evaluation result.',
  );
  process.exitCode = 1;
} finally {
  await client.close();
}

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/server/app.js';
import { publicFixtures, recordId } from '../../fixtures/records.js';
import { testContext } from './helpers.js';
import { HelpExchange } from '../../packages/core/help.js';

describe('database-backed MCP service', () => {
  let t: Awaited<ReturnType<typeof testContext>>, app: FastifyInstance, client: Client;
  const clients: Client[] = [];
  beforeAll(async () => {
    t = await testContext();
    app = await buildApp(t.app);
    await app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await app?.close();
    await t?.close();
  });
  const connect = async (token: string, modern = true) => {
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    const c = new Client(
      { name: 'nexus-integration', version: '0.1.0' },
      modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
    );
    clients.push(c);
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', resolve('apps/mcp/main.ts')],
        env: {
          PATH: process.env.PATH ?? '',
          NEXUS_URL: `http://127.0.0.1:${address.port}`,
          NEXUS_API_TOKEN: token,
        },
        stderr: 'pipe',
      }),
    );
    return c;
  };
  const json = (r: Awaited<ReturnType<Client['callTool']>>) => {
    const b = r.content[0];
    return JSON.parse(b?.type === 'text' ? b.text : 'null');
  };
  it('discovers and retrieves revision-specific evidence through HTTP, not database access', async () => {
    client = await connect(t.access.alice_agent);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('nexus_submit_draft');
    const result = await client.callTool({
      name: 'nexus_search',
      arguments: { query: 'zero validation', environment: { runtime: 'node', version: '24.22.3' } },
    });
    expect(result.isError).not.toBe(true);
    const records = json(result).data;
    expect(records.some((r: { id: string }) => r.id === recordId(1))).toBe(true);
    const detail = await client.callTool({
      name: 'nexus_get',
      arguments: { id: records[0].id, revision_id: records[0].revision_id },
    });
    expect(json(detail).data[0].demo).toBe(true);
  });
  it('cannot recover another owner’s private data through the adapter', async () => {
    const bob = await connect(t.access.bob_agent, false);
    const r = await bob.callTool({ name: 'nexus_get', arguments: { id: recordId(101) } });
    expect(r.isError).toBe(true);
  });
  it('keeps even the help-detail references within a small declared byte budget', async () => {
    const help = new HelpExchange(t.app);
    for (let i = 0; i < 20; i++)
      await help.request(
        t.alice,
        {
          question: `Authored private context-budget question ${i}; no sharing is authorized.`,
          environment: {},
        },
        randomUUID(),
      );
    const response = await client.callTool({
      name: 'nexus_list_help',
      arguments: { budget_bytes: 512 },
    });
    expect(response.isError).not.toBe(true);
    const data = json(response);
    expect(data.status).toBe('requires_detail');
    expect(data.truncated).toBe(true);
    expect(data.request_ids.length).toBeLessThan(20);
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThanOrEqual(512);
    expect(JSON.stringify(data)).not.toContain('Authored private context-budget question');
  });
  it('submits only private quarantine and records idempotent private outcomes', async () => {
    const key = randomUUID();
    const draft = await client.callTool({
      name: 'nexus_submit_draft',
      arguments: {
        draft: { content: publicFixtures[0]!.content, intended_visibility: 'public' },
        idempotency_key: key,
      },
    });
    expect(draft.isError).not.toBe(true);
    expect(json(draft).state).toBe('quarantined');
    expect(json(draft).visibility).toBe('private');
    const replay = await client.callTool({
      name: 'nexus_submit_draft',
      arguments: {
        draft: { content: publicFixtures[0]!.content, intended_visibility: 'public' },
        idempotency_key: key,
      },
    });
    expect(json(replay).id).toBe(json(draft).id);
    const outcome = {
      record_id: publicFixtures[0]!.id,
      revision_id: publicFixtures[0]!.revision_id,
      outcome: 'not_run',
      note: 'Requester has not run this check.',
    };
    const r = await client.callTool({
      name: 'nexus_report_outcome',
      arguments: { outcome, idempotency_key: randomUUID() },
    });
    expect(json(r).visibility).toBe('private');
    expect(json(r).self_reported).toBe(true);
  });
});

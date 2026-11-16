import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { federationPair } from './federation-helpers.js';
import { recordId, revisionId } from '../../fixtures/records.js';

describe('MCP across two Nexus origins', () => {
  it('preserves global references, compact context, private outcomes and withdrawal through actual stdio clients', async () => {
    const t = await federationPair(),
      clients: Client[] = [];
    const connect = async (url: string, token: string) => {
      const client = new Client(
        { name: 'nexus-federation-acceptance', version: '0.2.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      );
      clients.push(client);
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['--import', 'tsx', resolve('apps/mcp/main.ts')],
          env: { PATH: process.env.PATH ?? '', NEXUS_URL: url, NEXUS_API_TOKEN: token },
          stderr: 'pipe',
        }),
      );
      return client;
    };
    const data = (r: Awaited<ReturnType<Client['callTool']>>) =>
      JSON.parse(
        r.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      );
    try {
      await t.exportOne();
      await t.enable();
      await t.sync();
      await t.approve();
      const south = await connect(t.urlB, t.b.access.bob_agent),
        north = await connect(t.urlA, t.a.access.alice_agent);
      const query = {
        query: 'zero validation',
        environment: { runtime: 'node', version: '24.22.3' },
        include_federated: true,
        limit: 1,
      };
      const compact = await south.callTool({
        name: 'nexus_search',
        arguments: { ...query, budget_bytes: 512 },
      });
      expect(compact.isError).not.toBe(true);
      expect(data(compact).requires_detail[0].origin_node).toBe(t.north.node_id);
      expect(Buffer.byteLength(JSON.stringify(data(compact)))).toBeLessThanOrEqual(512);
      const found = await south.callTool({ name: 'nexus_search', arguments: query });
      expect(data(found).data[0].origin_node).toBe(t.north.node_id);
      const exact = await south.callTool({
        name: 'nexus_get',
        arguments: { origin_node: t.north.node_id, id: recordId(1), revision_id: revisionId(1) },
      });
      expect(data(exact).data[0].origin_node).toBe(t.north.node_id);
      expect(data(exact).data[0].evidence_summary[0].outcome).toBe('not_run');
      const sameOrigin = await north.callTool({
        name: 'nexus_get',
        arguments: { origin_node: t.north.node_id, id: recordId(1), revision_id: revisionId(1) },
      });
      expect(sameOrigin.isError).not.toBe(true);
      expect(data(sameOrigin).data[0].revision_status).toBe('current');
      const outcome = {
        origin_node: t.north.node_id,
        record_id: recordId(1),
        revision_id: revisionId(1),
        outcome: 'not_run',
        note: 'Private remote MCP report; no submitted code executed.',
      };
      const saved = await south.callTool({
        name: 'nexus_report_outcome',
        arguments: { outcome, idempotency_key: randomUUID() },
      });
      expect(saved.isError).not.toBe(true);
      expect(data(saved).visibility).toBe('private');
      expect((await t.fb.status(t.ownerB)).outcomes).toHaveLength(1);
      const local = await north.callTool({
        name: 'nexus_report_outcome',
        arguments: {
          outcome: { ...outcome, note: 'Private own-origin MCP report.' },
          idempotency_key: randomUUID(),
        },
      });
      expect(local.isError).not.toBe(true);
      expect((await t.a.store.activity(t.a.owner)).outcomes).toHaveLength(1);
      await t.a.store.withdraw(t.a.owner, recordId(1));
      await t.sync();
      expect(
        (
          await south.callTool({
            name: 'nexus_get',
            arguments: {
              origin_node: t.north.node_id,
              id: recordId(1),
              revision_id: revisionId(1),
            },
          })
        ).isError,
      ).toBe(true);
      expect(
        (await south.listTools()).tools.some((tool) => /approve|publish|export/.test(tool.name)),
      ).toBe(false);
    } finally {
      await Promise.all(clients.map((c) => c.close()));
      await t.close();
    }
  });
});

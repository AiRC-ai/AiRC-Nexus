import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe('P0 actual stdio MCP interoperability', () => {
  for (const modern of [false, true]) {
    it(`discovers and calls fixture tools with ${modern ? '2026 pinned' : 'legacy handshake'} negotiation`, async () => {
      const client = new Client(
        { name: 'nexus-compatibility-test', version: '0.1.0' },
        modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
      );
      clients.push(client);
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ['--import', 'tsx', resolve('apps/mcp/spike.ts')],
          stderr: 'pipe',
        }),
      );
      expect(client.getProtocolEra()).toBe(modern ? 'modern' : 'legacy');
      expect(client.getNegotiatedProtocolVersion()).toBe(modern ? '2026-07-28' : '2025-11-25');
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(['nexus_get', 'nexus_search']);
      const search = await client.callTool({
        name: 'nexus_search',
        arguments: { query: 'validation zero' },
      });
      expect(search.isError).not.toBe(true);
      const text = search.content[0];
      expect(text?.type).toBe('text');
      const result = JSON.parse(text?.type === 'text' ? text.text : 'null');
      expect(result.data[0].demo).toBe(true);
      const get = await client.callTool({
        name: 'nexus_get',
        arguments: { id: result.data[0].id, revision: result.data[0].revision },
      });
      expect(get.isError).not.toBe(true);
      const missing = await client.callTool({
        name: 'nexus_get',
        arguments: { id: 'missing', revision: 'missing' },
      });
      expect(missing.isError).toBe(true);
    });
  }
});

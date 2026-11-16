import { readFile } from 'node:fs/promises';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createNexusServer } from './server.js';
const token = process.env.NEXUS_TOKEN_FILE
  ? (await readFile(process.env.NEXUS_TOKEN_FILE, 'utf8')).trim()
  : process.env.NEXUS_API_TOKEN;
serveStdio(() => createNexusServer(process.env.NEXUS_URL ?? 'http://127.0.0.1:4318', token), {
  transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 131_072 }),
});

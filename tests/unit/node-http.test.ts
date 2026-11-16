import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createServer as tlsServer } from 'node:https';
import { createServer as plainServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { nodeRequest, httpsOrigin } from '../../packages/core/node-http.js';

describe('bounded HTTPS node transport', () => {
  let directory: string,
    server: ReturnType<typeof tlsServer>,
    target: ReturnType<typeof plainServer>,
    port: number,
    targetPort: number;
  let targetHits = 0;
  beforeAll(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'nexus-test-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        resolve(directory, 'key.pem'),
        '-out',
        resolve(directory, 'ca.pem'),
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    target = plainServer((_q, r) => {
      targetHits++;
      r.end('redirect target');
    });
    await new Promise<void>((done) => target.listen(0, '127.0.0.1', done));
    targetPort = (target.address() as any).port;
    server = tlsServer(
      {
        key: await readFile(resolve(directory, 'key.pem')),
        cert: await readFile(resolve(directory, 'ca.pem')),
      },
      (q, r) => {
        if (q.url === '/redirect') {
          r.writeHead(302, { Location: `http://127.0.0.1:${targetPort}` });
          r.end();
          return;
        }
        if (q.url === '/slow') {
          r.writeHead(200);
          const interval = setInterval(() => r.write('x'), 10);
          r.once('close', () => clearInterval(interval));
          return;
        }
        r.end(JSON.stringify({ ok: true }));
      },
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as any).port;
  });
  afterAll(async () => {
    await Promise.all([
      new Promise<void>((r) => server.close(() => r())),
      new Promise<void>((r) => target.close(() => r())),
    ]);
    await rm(directory, { recursive: true, force: true });
  });
  const options = () => ({ timeoutMs: 1000, maxBytes: 1024, caFile: resolve(directory, 'ca.pem') });
  it('requires a trusted chain and matching hostname', async () => {
    expect((await nodeRequest(new URL(`https://localhost:${port}`), options())).status).toBe(200);
    await expect(
      nodeRequest(new URL(`https://localhost:${port}`), { timeoutMs: 1000, maxBytes: 1024 }),
    ).rejects.toThrow(/node_tls_/);
    await expect(nodeRequest(new URL(`https://127.0.0.1:${port}`), options())).rejects.toThrow(
      /ALTNAME/,
    );
  });
  it('does not forward credentials to redirects and enforces bytes and absolute deadline', async () => {
    expect(
      (
        await nodeRequest(new URL(`https://localhost:${port}/redirect`), {
          ...options(),
          headers: { Authorization: 'Bearer authored-test-only' },
        })
      ).status,
    ).toBe(302);
    expect(targetHits).toBe(0);
    await expect(
      nodeRequest(new URL(`https://localhost:${port}`), { ...options(), maxBytes: 2 }),
    ).rejects.toThrow('node_response_limit');
    await expect(
      nodeRequest(new URL(`https://localhost:${port}/slow`), { ...options(), timeoutMs: 70 }),
    ).rejects.toThrow('node_request_deadline');
  });
  it('accepts only a canonical HTTPS DNS origin for hosted nodes', () => {
    expect(httpsOrigin('https://north.example.org:9443/')).toBe('https://north.example.org:9443');
    for (const url of [
      'http://north.example.org',
      'https://127.0.0.1:9443',
      'https://name:secret@north.example.org',
      'https://north.example.org/path',
      'https://north.example.org/?callback=other',
    ])
      expect(() => httpsOrigin(url)).toThrow();
  });
});

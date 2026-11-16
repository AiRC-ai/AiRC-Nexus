import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../apps/server/app.js';
import { tokenHash } from '../../packages/db/index.js';
import { IDS, publicFixtures, recordId } from '../../fixtures/records.js';
import { testContext } from './helpers.js';

describe('HTTP authority and session boundary', () => {
  let t: Awaited<ReturnType<typeof testContext>>, app: FastifyInstance;
  const host = '127.0.0.1:4318',
    origin = `http://${host}`;
  beforeAll(async () => {
    t = await testContext();
    app = await buildApp(t.app);
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await t?.close();
  });
  it('serves only loopback host names and rejects foreign mutation origins', async () => {
    expect(
      (await app.inject({ url: '/health', headers: { host: 'attacker.example' } })).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: '/health', headers: { host } })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/exchange',
          headers: { host, origin: 'https://attacker.example' },
          payload: { code: 'irrelevantcode' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('returns uniform private/missing reads and no-store responses', async () => {
    const privateRead = await app.inject({
      url: `/api/v1/records/${recordId(101)}`,
      headers: { host },
    });
    const missing = await app.inject({ url: `/api/v1/records/${randomUUID()}`, headers: { host } });
    expect(privateRead.statusCode).toBe(404);
    expect(privateRead.body).toBe(missing.body);
    expect(privateRead.headers['cache-control']).toBe('no-store');
    expect(
      (
        await app.inject({
          url: '/api/me',
          headers: { host, authorization: 'Bearer invalidcredential' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects actor spoofing, oversized input and agent publication', async () => {
    const headers = {
      host,
      authorization: `Bearer ${t.access.alice_agent}`,
      'idempotency-key': randomUUID(),
    };
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/drafts',
      headers,
      payload: { content: publicFixtures[0]!.content, owner_id: IDS.bob },
    });
    expect(r.statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/publications', headers, payload: {} }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/drafts',
          headers,
          payload: { padding: 'x'.repeat(70_000) },
        })
      ).statusCode,
    ).toBe(413);
  });
  it('exchanges one-time codes for HttpOnly sessions and revokes logout', async () => {
    const code = randomBytes(24).toString('hex');
    await t.admin.query(
      "INSERT INTO nexus.credentials(token_hash,principal_id,scopes,kind,expires_at) VALUES($1,$2,$3,'exchange',now()+interval '1 hour')",
      [tokenHash(code), IDS.alice, ['read', 'draft', 'review', 'publish', 'withdraw', 'outcome']],
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/exchange',
      headers: { host, origin },
      payload: { code },
    });
    expect(response.statusCode).toBe(200);
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const sessionCookie = setCookie.split(';')[0]!;
    expect(
      (await app.inject({ url: '/api/me', headers: { host, cookie: sessionCookie } })).json().user
        .kind,
    ).toBe('human');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/exchange',
          headers: { host, origin },
          payload: { code },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { host, origin, cookie: sessionCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/me', headers: { host, cookie: sessionCookie } })).statusCode,
    ).toBe(401);
  });
});

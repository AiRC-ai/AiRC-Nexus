import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { testContext } from './helpers.js';
import { provisionHosted } from '../../packages/federation/hosted.js';
import { Federation } from '../../packages/federation/service.js';
import { buildApp } from '../../apps/server/app.js';
import { authenticate } from '../../packages/db/index.js';

describe('hosted operators and HTTPS origin boundary', () => {
  it('provisions unique host-local identities without copying demo users and preserves existing credentials', async () => {
    const directory = await mkdtemp(resolve('.nexus/hosted-test-')),
      a = await testContext({ records: false }),
      b = await testContext({ records: false });
    try {
      for (const t of [a, b]) await t.admin.query('TRUNCATE nexus.principals CASCADE');
      const x = await provisionHosted(a.admin, {
        stateDir: resolve(directory, 'a'),
        origin: 'https://a.example.org:9443',
        label: 'North',
        operatorName: 'North operator',
      });
      const y = await provisionHosted(b.admin, {
        stateDir: resolve(directory, 'b'),
        origin: 'https://b.example.org:9443',
        label: 'South',
        operatorName: 'South operator',
      });
      expect(x.access.operator_id).not.toBe(y.access.operator_id);
      expect(x.access.agent_token).not.toBe(y.access.agent_token);
      expect(x.identity.key_id).not.toBe(y.identity.key_id);
      expect(
        (await a.admin.query('SELECT count(*)::int AS n FROM nexus.principals')).rows[0].n,
      ).toBe(3);
      expect(await authenticate(b.app, x.access.agent_token)).toBeNull();
      const again = await provisionHosted(a.admin, {
        stateDir: resolve(directory, 'a'),
        origin: 'https://a.example.org:9443',
        label: 'North',
        operatorName: 'North operator',
      });
      expect(again.access).toEqual(x.access);
      expect(again.identity.node_id).toBe(x.identity.node_id);
      expect(await readFile(resolve(directory, 'a/public/node.json'), 'utf8')).not.toContain(
        'private_key',
      );
    } finally {
      await Promise.all([a.close(), b.close()]);
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('uses secure host-only sessions and the configured HTTPS origin, ignoring spoofed forwarding headers', async () => {
    const directory = await mkdtemp(resolve('.nexus/hosted-origin-')),
      t = await testContext({ records: false });
    let app;
    try {
      await t.admin.query('TRUNCATE nexus.principals CASCADE');
      const { identity, access } = await provisionHosted(t.admin, {
        stateDir: directory,
        origin: 'https://a.example.org:9443',
        label: 'North',
        operatorName: 'North operator',
      });
      app = await buildApp(t.app, {
        publicOrigin: 'https://a.example.org:9443',
        federation: new Federation(t.app, identity),
      });
      const payload = { code: access.operator_code };
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/exchange',
            headers: {
              host: 'evil.example.org',
              'x-forwarded-host': 'a.example.org:9443',
              'x-forwarded-proto': 'https',
              origin: 'https://a.example.org:9443',
            },
            payload,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/exchange',
            headers: { host: 'a.example.org:9443', origin: 'http://a.example.org:9443' },
            payload,
          })
        ).statusCode,
      ).toBe(403);
      const ok = await app.inject({
        method: 'POST',
        url: '/api/auth/exchange',
        headers: { host: 'a.example.org:9443', origin: 'https://a.example.org:9443' },
        payload,
      });
      expect(ok.statusCode).toBe(200);
      const cookie = String(ok.headers['set-cookie']);
      expect(cookie.startsWith('__Host-nexus_')).toBe(true);
      expect(cookie.includes('Secure')).toBe(true);
      expect(cookie.includes('HttpOnly')).toBe(true);
      expect(cookie.includes('Domain=')).toBe(false);
      expect(
        (
          await app.inject({
            url: '/api/me',
            headers: { host: 'a.example.org:9443', cookie: cookie.split(';')[0] },
          })
        ).json().user.id,
      ).toBe(access.operator_id);
    } finally {
      await app?.close();
      await t.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

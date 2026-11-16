import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import { Store } from '../../packages/core/store.js';
import { NexusError } from '../../packages/core/errors.js';
import { HelpExchange } from '../../packages/core/help.js';
import { ANONYMOUS, type Principal } from '../../packages/contracts/index.js';
import { authenticate, tokenHash, withActor, type Pool } from '../../packages/db/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}
export async function buildApp(pool: Pool, options: { port?: number; staticRoot?: string } = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 65_536,
    requestTimeout: 10_000,
    routerOptions: { maxParamLength: 200 },
  });
  const store = new Store(pool);
  const help = new HelpExchange(pool);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.decorateRequest('principal');
  app.addHook('onRequest', async (request, reply) => {
    const address = app.server.address();
    const port = address && typeof address === 'object' ? address.port : (options.port ?? 4318);
    const host = request.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
      throw new NexusError('invalid_host', 403);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const browserMutation =
        !!request.cookies.nexus_session || request.url.startsWith('/api/auth/');
      if ((browserMutation || origin) && origin !== `http://${host}`)
        throw new NexusError('invalid_origin', 403);
    }
    if (request.url.startsWith('/api/auth/')) return;
    const bearer = request.headers.authorization;
    if (bearer && !/^Bearer [A-Za-z0-9_-]{8,256}$/.test(bearer))
      throw new NexusError('invalid_credential', 401);
    const token = bearer?.slice(7) ?? request.cookies.nexus_session;
    const actor = await authenticate(pool, token);
    if (!actor) throw new NexusError('invalid_credential', 401);
    request.principal = actor;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NexusError) return reply.status(error.status).send({ error: error.code });
    if (error instanceof ZodError)
      return reply.status(400).send({
        error: 'invalid_input',
        fields: error.issues.slice(0, 8).map((i) => i.path.map(String).join('.')),
      });
    const e = error as { code?: string; statusCode?: number };
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
      return reply.status(413).send({ error: 'body_too_large' });
    if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited' });
    if (e.statusCode === 400 || e.statusCode === 415)
      return reply.status(e.statusCode).send({ error: 'invalid_request' });
    if (e.code === '42501') return reply.status(403).send({ error: 'forbidden' });
    if (e.code === 'P0001' || e.code?.startsWith('23'))
      return reply.status(409).send({ error: 'operation_rejected' });
    return reply.status(500).send({ error: 'service_unavailable' });
  });
  const browserHuman = (request: {
    principal: Principal;
    headers: { authorization?: string | undefined };
    cookies: Record<string, string | undefined>;
  }) => {
    if (
      request.principal.kind !== 'human' ||
      request.headers.authorization ||
      !request.cookies.nexus_session
    )
      throw new NexusError('human_session_required', 403);
  };
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', mode: 'local-demo', version: '0.1.0' };
  });
  app.post(
    '/api/auth/exchange',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = z
        .object({ code: z.string().min(8).max(256) })
        .strict()
        .parse(request.body);
      const token = `nexus_session_${randomBytes(32).toString('hex')}`;
      const r = await pool.query('SELECT nexus.exchange_credential($1,$2) AS accepted', [
        tokenHash(body.code),
        tokenHash(token),
      ]);
      if (!r.rows[0].accepted) throw new NexusError('invalid_sign_in_code', 401);
      reply.setCookie('nexus_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/',
        maxAge: 43_200,
      });
      return { signed_in: true };
    },
  );
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.cookies.nexus_session)
      await pool.query('SELECT nexus.revoke_session($1)', [
        tokenHash(request.cookies.nexus_session),
      ]);
    reply.clearCookie('nexus_session', { path: '/' });
    return { signed_out: true };
  });
  app.get('/api/me', async (request) => ({
    user: {
      id: request.principal.id,
      name: request.principal.name,
      kind: request.principal.kind,
      role: request.principal.role,
      scopes: request.principal.scopes,
    },
    teams: await withActor(
      pool,
      request.principal,
      async (db) => (await db.query('SELECT id,name FROM nexus.teams')).rows,
    ),
    demo: true,
  }));
  app.get('/api/v1/search', async (request) => {
    const q = z
      .object({
        query: z.string().optional(),
        profile: z.string().optional(),
        environment: z.string().max(4_096).optional(),
        limit: z.string().optional(),
        budget_bytes: z.string().optional(),
        include_unknown: z.enum(['true', 'false']).optional(),
        show_disputed: z.enum(['true', 'false']).optional(),
      })
      .strict()
      .parse(request.query);
    let environment;
    try {
      environment = q.environment ? JSON.parse(q.environment) : {};
    } catch {
      throw new NexusError('invalid_environment');
    }
    return store.search(request.principal, {
      query: q.query ?? '',
      environment,
      ...(q.profile ? { profile: q.profile } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
      ...(q.budget_bytes ? { budget_bytes: q.budget_bytes } : {}),
      include_unknown: q.include_unknown === 'true',
      show_disputed: q.show_disputed === 'true',
    });
  });
  app.get<{ Params: { id: string }; Querystring: { revision?: string } }>(
    '/api/v1/records/:id',
    (request) => store.get(request.principal, request.params.id, request.query.revision),
  );
  app.get('/api/v1/drafts', (request) => store.drafts(request.principal));
  app.post('/api/v1/drafts', async (request, reply) => {
    const r = await store.createDraft(
      request.principal,
      request.body,
      String(request.headers['idempotency-key'] ?? ''),
    );
    return reply.status(201).send(r);
  });
  app.post<{ Params: { id: string } }>('/api/v1/records/:id/revisions', (request) =>
    store.createDraft(
      request.principal,
      request.body,
      String(request.headers['idempotency-key'] ?? ''),
      request.params.id,
    ),
  );
  app.post<{ Params: { id: string } }>('/api/v1/drafts/:id/submit', (request) => {
    const body = z.object({ revision_id: z.uuid() }).strict().parse(request.body);
    return store.submit(
      request.principal,
      request.params.id,
      body.revision_id,
      String(request.headers['idempotency-key'] ?? ''),
    );
  });
  app.post('/api/v1/outcomes', (request) =>
    store.reportOutcome(
      request.principal,
      request.body,
      String(request.headers['idempotency-key'] ?? ''),
    ),
  );
  app.get('/api/v1/activity', async (request) => {
    const [activity, exchange] = await Promise.all([
      store.activity(request.principal),
      help.list(request.principal),
    ]);
    return { ...activity, help: exchange.requests };
  });
  app.get('/api/v1/help/participants', (request) => help.participants(request.principal));
  app.get<{ Querystring: { id?: string } }>('/api/v1/help', (request) =>
    help.list(request.principal, request.query.id),
  );
  app.post('/api/v1/help', (request) =>
    help.request(request.principal, request.body, String(request.headers['idempotency-key'] ?? '')),
  );
  app.post('/api/v1/help/share', (request) => {
    browserHuman(request);
    return help.share(request.principal, request.body);
  });
  app.post<{ Params: { id: string } }>('/api/v1/help/:id/close', (request) => {
    browserHuman(request);
    return help.close(request.principal, request.params.id);
  });
  app.post('/api/v1/help/replies', (request) =>
    help.reply(request.principal, request.body, String(request.headers['idempotency-key'] ?? '')),
  );
  app.post('/api/v1/help/replies/share', (request) => {
    browserHuman(request);
    return help.shareReply(request.principal, request.body);
  });
  app.post('/api/v1/reviews', (request) => {
    browserHuman(request);
    return store.review(request.principal, request.body);
  });
  app.post('/api/v1/publications', (request) => {
    browserHuman(request);
    return store.publish(request.principal, request.body);
  });
  app.post('/api/v1/assessments', (request) => {
    browserHuman(request);
    return store.addAssessment(request.principal, request.body);
  });
  app.post<{ Params: { id: string } }>('/api/v1/records/:id/withdraw', (request) => {
    browserHuman(request);
    return store.withdraw(request.principal, request.params.id);
  });
  const staticRoot = options.staticRoot ?? resolve('apps/web/dist');
  if (existsSync(staticRoot)) {
    await app.register(staticFiles, { root: staticRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found' });
      if (request.url.startsWith('/assets/')) return reply.status(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

import { z } from 'zod';
import { HelpRequestSchema, HelpReplySchema, type Principal } from '../contracts/index.js';
import { withActor, type Pool, type Connection } from '../db/index.js';
import { digest } from './store.js';
import { screenText } from './screen.js';
import { NexusError } from './errors.js';

export class HelpExchange {
  constructor(readonly pool: Pool) {}
  private scope(actor: Principal, name: string) {
    if (actor.kind === 'anonymous' || !actor.scopes.includes(name))
      throw new NexusError('authentication_required', 401);
  }
  private human(actor: Principal) {
    this.scope(actor, 'draft');
    if (actor.kind !== 'human') throw new NexusError('human_owner_required', 403);
  }
  private async once(
    db: Connection,
    actor: Principal,
    operation: string,
    key: string,
    body: unknown,
    fn: () => Promise<unknown>,
  ) {
    if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new NexusError('idempotency_key_required');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${actor.id}:${operation}:${key}`,
    ]);
    const existing = await db.query(
      'SELECT body_digest,result FROM nexus.idempotency WHERE principal_id=$1 AND operation=$2 AND key=$3',
      [actor.id, operation, key],
    );
    const hash = digest(body);
    if (existing.rowCount) {
      if (existing.rows[0].body_digest !== hash) throw new NexusError('idempotency_conflict', 409);
      return existing.rows[0].result;
    }
    const result = JSON.parse(JSON.stringify(await fn()));
    await db.query(
      'INSERT INTO nexus.idempotency(principal_id,operation,key,body_digest,result) VALUES($1,$2,$3,$4,$5)',
      [actor.id, operation, key, hash, JSON.stringify(result)],
    );
    return result;
  }
  async participants(actor: Principal) {
    this.human(actor);
    return withActor(
      this.pool,
      actor,
      async (db) =>
        (
          await db.query(
            'SELECT owner_id,label FROM nexus.help_participants WHERE opted_in AND owner_id<>$1',
            [actor.owner_id],
          )
        ).rows,
    );
  }
  async request(actor: Principal, input: unknown, key: string) {
    this.scope(actor, 'draft');
    const body = HelpRequestSchema.parse(input);
    return withActor(this.pool, actor, (db) =>
      this.once(db, actor, 'help_request', key, body, async () => {
        const reasons = screenText(JSON.stringify(body));
        const { rows } = await db.query(
          `INSERT INTO nexus.help_requests(owner_id,creator_id,question,environment,digest,screening)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,digest,state,expires_at`,
          [
            actor.owner_id,
            actor.id,
            body.question,
            JSON.stringify(body.environment),
            digest(body),
            JSON.stringify({ blocked: reasons.length > 0, reasons }),
          ],
        );
        return { ...rows[0], demo: true };
      }),
    );
  }
  async list(actor: Principal, id?: string) {
    this.scope(actor, 'read');
    if (id) z.uuid().parse(id);
    return withActor(this.pool, actor, async (db) => {
      const { rows } = await db.query(
        `SELECT id,question,environment,digest,screening,state,expires_at,created_at,
        owner_id=$1 AS mine,recipient_owner_id FROM nexus.help_requests
        WHERE ($2::uuid IS NULL OR id=$2) ORDER BY created_at DESC LIMIT 50`,
        [actor.owner_id, id ?? null],
      );
      if (id && !rows.length) throw new NexusError('not_found', 404);
      for (const row of rows) {
        row.replies = (
          await db.query(
            `SELECT id,${id ? 'content,' : ''}digest,shared,owner_id=$2 AS mine,screening,created_at
          FROM nexus.help_replies WHERE request_id=$1 ORDER BY created_at DESC LIMIT 10`,
            [row.id, actor.owner_id],
          )
        ).rows;
      }
      return { requests: rows, demo: true, data_only: true };
    });
  }
  async share(actor: Principal, input: unknown) {
    this.human(actor);
    const body = z
      .object({
        id: z.uuid(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        recipient_owner_id: z.uuid(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input);
    return withActor(this.pool, actor, async (db) => {
      const { rows } = await db.query(
        `UPDATE nexus.help_requests SET state='shared',recipient_owner_id=$3,approved_digest=$2
        WHERE id=$1 AND digest=$2 AND state='private' RETURNING id,state`,
        [body.id, body.digest, body.recipient_owner_id],
      );
      if (!rows.length) throw new NexusError('sharing_precondition', 409);
      return rows[0];
    });
  }
  async close(actor: Principal, id: string) {
    this.human(actor);
    z.uuid().parse(id);
    return withActor(this.pool, actor, async (db) => {
      const { rows } = await db.query(
        "UPDATE nexus.help_requests SET state='closed' WHERE id=$1 RETURNING id,state",
        [id],
      );
      if (!rows.length) throw new NexusError('not_found', 404);
      return rows[0];
    });
  }
  async reply(actor: Principal, input: unknown, key: string) {
    this.scope(actor, 'draft');
    const body = HelpReplySchema.parse(input);
    return withActor(this.pool, actor, (db) =>
      this.once(db, actor, 'help_reply', key, body, async () => {
        const allowed = await db.query('SELECT nexus.can_reply_help($1) AS allowed', [
          body.request_id,
        ]);
        if (!allowed.rows[0].allowed) throw new NexusError('not_found', 404);
        const reasons = screenText(JSON.stringify(body));
        const { rows } = await db.query(
          `INSERT INTO nexus.help_replies(request_id,owner_id,creator_id,content,digest,screening)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,digest,shared`,
          [
            body.request_id,
            actor.owner_id,
            actor.id,
            JSON.stringify(body),
            digest(body),
            JSON.stringify({ blocked: reasons.length > 0, reasons }),
          ],
        );
        return { ...rows[0], visibility: 'private', demo: true };
      }),
    );
  }
  async shareReply(actor: Principal, input: unknown) {
    this.human(actor);
    const body = z
      .object({
        id: z.uuid(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
        shared: z.boolean().default(true),
      })
      .strict()
      .parse(input);
    return withActor(this.pool, actor, async (db) => {
      const { rows } = await db.query(
        'UPDATE nexus.help_replies SET shared=$3 WHERE id=$1 AND digest=$2 RETURNING id,shared',
        [body.id, body.digest, body.shared],
      );
      if (!rows.length) throw new NexusError('not_found', 404);
      return rows[0];
    });
  }
}

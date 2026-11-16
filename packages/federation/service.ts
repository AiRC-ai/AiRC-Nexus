import { z } from 'zod';
import { ANONYMOUS, SearchSchema, OutcomeSchema, type Principal } from '../contracts/index.js';
import { withActor, type Pool } from '../db/index.js';
import { NexusError } from '../core/errors.js';
import { screen } from '../core/screen.js';
import { compatibility } from '../core/context.js';
import {
  ActiveItemSchema,
  RequestSchema,
  SnapshotSchema,
  LEASE_MS,
  MAX_PACKET_BYTES,
  PROTOCOL,
  artifactDigest,
  keyId,
  signed,
  verified,
  type Identity,
  type ActiveItem,
} from './protocol.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export class Federation {
  constructor(
    readonly pool: Pool,
    readonly identity: Identity,
  ) {}
  private read(actor: Principal) {
    if (!actor.scopes.includes('read')) throw new NexusError('forbidden', 403);
  }
  async ready() {
    const row = await withActor(
      this.pool,
      ANONYMOUS,
      async (db) =>
        (await db.query('SELECT node_id,key_id FROM nexus.federation_identity')).rows[0],
    );
    if (row?.node_id !== this.identity.node_id || row?.key_id !== this.identity.key_id)
      throw new Error('federation_identity_mismatch');
  }
  async snapshot(input: unknown) {
    const untrusted = z
      .object({ payload: RequestSchema, signature: z.string() })
      .strict()
      .parse(input);
    const request = untrusted.payload;
    return withActor(this.pool, ANONYMOUS, async (db) => {
      const own = (await db.query('SELECT node_id,key_id FROM nexus.federation_identity')).rows[0];
      if (own?.node_id !== this.identity.node_id || own?.key_id !== this.identity.key_id)
        throw new NexusError('node_key_unavailable', 503);
      const peer = (
        await db.query('SELECT * FROM nexus.federation_peers WHERE node_id=$1 AND active', [
          request.origin,
        ])
      ).rows[0];
      if (
        !peer ||
        peer.key_id !== request.key_id ||
        keyId(peer.public_key) !== peer.key_id ||
        request.audience !== this.identity.node_id ||
        Math.abs(Date.now() - request.issued_at) > 5000
      )
        throw new NexusError('peer_authentication_failed', 403);
      try {
        verified(input, peer.public_key);
      } catch {
        throw new NexusError('peer_authentication_failed', 403);
      }
      const nonce = await db.query('SELECT nexus.fed_accept_nonce($1,$2,$3) AS accepted', [
        peer.node_id,
        peer.key_id,
        request.nonce,
      ]);
      if (!nonce.rows[0].accepted) throw new NexusError('peer_request_rejected', 409);
      const data = (
        await db.query('SELECT nexus.fed_export_snapshot($1) AS snapshot', [peer.node_id])
      ).rows[0].snapshot;
      // Even existing public demo records are screened again before crossing a node boundary.
      data.items = data.items.map(
        (item: ActiveItem | { state: 'unavailable'; record_id: string }) => {
          if (item.state === 'unavailable') return item;
          const parsed = ActiveItemSchema.safeParse(item);
          return parsed.success && !screen(parsed.data.content).blocked
            ? parsed.data
            : { state: 'unavailable', record_id: item.record_id };
        },
      );
      const now = Date.now();
      const payload = SnapshotSchema.parse({
        protocol: PROTOCOL,
        origin: this.identity.node_id,
        audience: peer.node_id,
        key_id: this.identity.key_id,
        request_nonce: request.nonce,
        issued_at: now,
        expires_at: now + LEASE_MS,
        complete: true,
        sequence: data.sequence,
        items: data.items,
      });
      const result = signed(this.identity, payload);
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_PACKET_BYTES)
        throw new NexusError('snapshot_capacity', 503);
      return result;
    });
  }
  async status(actor: Principal) {
    this.read(actor);
    return withActor(this.pool, actor, async (db) => {
      const operator = (await db.query('SELECT nexus.fed_operator() AS yes')).rows[0].yes;
      const peers = (
        await db.query(
          'SELECT node_id,label,endpoint,key_id,active,import_enabled,export_enabled,last_success,last_failure FROM nexus.federation_peers ORDER BY label LIMIT 16',
        )
      ).rows;
      const rows = (
        await db.query(`SELECT c.peer_id,c.record_id,c.revision_id,c.artifact_digest,c.valid_until,c.blocked,c.state,
        CASE WHEN c.valid_until>clock_timestamp() AND p.active AND p.import_enabled AND p.key_id=c.key_id THEN c.payload ELSE NULL END AS payload,
        nexus.fed_usable(c.peer_id,c.record_id) AS approved,p.label AS origin_label
        FROM nexus.federation_cache c JOIN nexus.federation_peers p ON p.node_id=c.peer_id ORDER BY p.label,c.record_id LIMIT 100`)
      ).rows;
      for (const row of rows) {
        const item = this.checked(row);
        if (row.payload && !item) {
          row.payload = null;
          row.approved = false;
          row.blocked = true;
        } else if (item && screen(item.content).blocked) {
          row.blocked = true;
          row.approved = false;
          if (!operator) row.payload = null;
        }
      }
      const activity =
        actor.kind === 'anonymous'
          ? []
          : (
              await db.query(
                'SELECT action,peer_id,record_id,revision_id,created_at FROM nexus.federation_events ORDER BY created_at DESC LIMIT 40',
              )
            ).rows;
      const outcomes =
        actor.kind === 'anonymous'
          ? []
          : (
              await db.query(`SELECT id,peer_id,record_id,revision_id,outcome,note,created_at
        FROM nexus.federation_outcomes ORDER BY created_at DESC LIMIT 30`)
            ).rows;
      for (const outcome of outcomes) {
        const record = rows.find(
          (r) =>
            r.peer_id === outcome.peer_id &&
            r.record_id === outcome.record_id &&
            r.revision_id === outcome.revision_id &&
            r.approved &&
            r.payload,
        );
        outcome.title = record?.payload.content.title ?? null;
      }
      return {
        enabled: true,
        node: {
          node_id: this.identity.node_id,
          label: this.identity.label,
          key_id: this.identity.key_id,
        },
        can_operate: operator,
        peers,
        records: rows.filter((row) => operator || (row.approved && row.payload)),
        activity,
        outcomes,
        lease_seconds: LEASE_MS / 1000,
        demo: true,
      };
    });
  }
  async grants(actor: Principal, id: string) {
    this.read(actor);
    z.uuid().parse(id);
    return withActor(
      this.pool,
      actor,
      async (db) =>
        (
          await db.query(
            'SELECT peer_id,revision_id,digest,enabled,consent_at FROM nexus.federation_exports WHERE record_id=$1',
            [id],
          )
        ).rows,
    );
  }
  private human(actor: Principal) {
    if (actor.kind !== 'human' || !actor.scopes.includes('publish'))
      throw new NexusError('human_owner_required', 403);
  }
  async grant(actor: Principal, input: unknown) {
    this.human(actor);
    const body = z
      .object({
        record_id: z.uuid(),
        revision_id: z.uuid(),
        digest: hash,
        peer_id: z.uuid(),
        enabled: z.boolean(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input);
    await withActor(this.pool, actor, async (db) => {
      await db.query('SELECT nexus.fed_export_grant($1,$2,$3,$4,$5)', [
        body.record_id,
        body.revision_id,
        body.digest,
        body.peer_id,
        body.enabled,
      ]);
    });
    return {
      enabled: body.enabled,
      record_id: body.record_id,
      revision_id: body.revision_id,
      peer_id: body.peer_id,
    };
  }
  async peerConsent(actor: Principal, input: unknown) {
    this.human(actor);
    const body = z
      .object({ peer_id: z.uuid(), import_enabled: z.boolean(), confirmed: z.literal(true) })
      .strict()
      .parse(input);
    return withActor(this.pool, actor, async (db) => {
      const r = await db.query(
        'UPDATE nexus.federation_peers SET import_enabled=$2 WHERE node_id=$1 RETURNING node_id,import_enabled',
        [body.peer_id, body.import_enabled],
      );
      if (!r.rowCount) throw new NexusError('operator_required', 403);
      return r.rows[0];
    });
  }
  async approve(actor: Principal, input: unknown) {
    this.human(actor);
    const body = z
      .object({
        peer_id: z.uuid(),
        record_id: z.uuid(),
        revision_id: z.uuid(),
        artifact_digest: hash,
        accepted: z.boolean(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input);
    await withActor(this.pool, actor, async (db) => {
      if (body.accepted) {
        const row = (
          await db.query(
            'SELECT payload,artifact_digest FROM nexus.federation_cache WHERE peer_id=$1 AND record_id=$2',
            [body.peer_id, body.record_id],
          )
        ).rows[0];
        const item = row ? this.checked(row) : null;
        if (!item || screen(item.content).blocked)
          throw new NexusError('federation_review_precondition', 409);
      }
      await db.query('SELECT nexus.fed_approve($1,$2,$3,$4,$5)', [
        body.peer_id,
        body.record_id,
        body.revision_id,
        body.artifact_digest,
        body.accepted,
      ]);
    });
    return { accepted: body.accepted };
  }
  private checked(row: Record<string, any>) {
    const parsed = ActiveItemSchema.safeParse(row.payload);
    if (!parsed.success) return null;
    const item = parsed.data;
    return artifactDigest(item) === row.artifact_digest &&
      artifactDigest({ ...item.content, intended_visibility: 'public' }) === item.digest
      ? item
      : null;
  }
  private present(row: Record<string, any>) {
    const item = this.checked(row);
    if (!item || screen(item.content).blocked) throw new NexusError('not_found', 404);
    return {
      id: item.record_id,
      record_id: item.record_id,
      revision_id: item.revision_id,
      sequence: item.sequence,
      digest: item.digest,
      artifact_digest: row.artifact_digest,
      content: item.content,
      evidence_summary: item.evidence,
      origin_node: row.peer_id,
      origin_label: row.origin_label,
      source_url: `${row.endpoint}/#/record/${item.record_id}?revision=${item.revision_id}`,
      valid_until: row.valid_until,
      verified_at: row.last_success,
      federated: true,
      demo: true,
      limitations: [
        'Origin-reported public evidence summary; underlying assessments and private outcomes were not transferred.',
        'A node signature identifies the sender; it does not independently validate the claim.',
      ],
    };
  }
  async get(actor: Principal, peer: string, id: string, revision?: string) {
    this.read(actor);
    z.uuid().parse(peer);
    z.uuid().parse(id);
    if (revision) z.uuid().parse(revision);
    return withActor(this.pool, actor, async (db) => {
      const rows = (
        await db.query(
          `SELECT c.*,p.label AS origin_label,p.endpoint,p.last_success FROM nexus.federation_cache c
        JOIN nexus.federation_peers p ON p.node_id=c.peer_id WHERE c.peer_id=$1 AND c.record_id=$2
        AND ($3::uuid IS NULL OR c.revision_id=$3) AND nexus.fed_usable(c.peer_id,c.record_id)`,
          [peer, id, revision ?? null],
        )
      ).rows;
      if (!rows.length) throw new NexusError('not_found', 404);
      const result = this.present(rows[0]);
      await db.query('SELECT nexus.fed_log($1,$2,$3)', [peer, id, rows[0].revision_id]);
      return result;
    });
  }
  async search(actor: Principal, input: unknown) {
    this.read(actor);
    const opts = SearchSchema.parse(input);
    return withActor(this.pool, actor, async (db) => {
      const rows = (
        await db.query(`SELECT c.*,p.label AS origin_label,p.endpoint,p.last_success FROM nexus.federation_cache c
        JOIN nexus.federation_peers p ON p.node_id=c.peer_id WHERE nexus.fed_usable(c.peer_id,c.record_id) ORDER BY c.peer_id,c.record_id LIMIT 100`)
      ).rows;
      const words = opts.query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const candidates = [];
      for (const row of rows) {
        const item = this.checked(row);
        if (!item || screen(item.content).blocked) continue;
        const record = this.present(row),
          content = record.content;
        if (opts.profile && content.profile !== opts.profile) continue;
        const haystack =
          `${content.title} ${content.problem} ${content.resolution}`.toLocaleLowerCase();
        if (words.length && !words.some((w) => haystack.includes(w))) continue;
        const match = compatibility(content.environment, opts.environment);
        if (match === 'incompatible' || (match === 'unknown' && !opts.include_unknown)) continue;
        if (!opts.show_disputed && record.evidence_summary.some((e) => e.outcome === 'failed'))
          continue;
        candidates.push({
          ...content,
          id: record.id,
          revision_id: record.revision_id,
          origin_node: record.origin_node,
          origin_label: record.origin_label,
          federation: {
            valid_until: record.valid_until,
            verified_at: record.verified_at,
            source_url: record.source_url,
          },
          federated: true,
          visibility: 'public',
          compatibility: match,
          retrieval: words.every((w) => haystack.includes(w)) ? 'strict_terms' : 'broader_keywords',
          limitations: [
            ...content.limitations,
            ...record.limitations,
            'Federated keyword candidate: confirm relevance to the actual question.',
          ],
          evidence: record.evidence_summary.map((e) => ({
            method: e.method,
            outcome: e.outcome,
            count: e.count,
            independence: 'origin_reported',
            note: 'Summary reported by the source node; no independent verification by this node.',
          })),
          evidence_status: 'origin_reported',
        });
        await db.query('SELECT nexus.fed_log($1,$2,$3)', [
          record.origin_node,
          record.id,
          record.revision_id,
        ]);
        if (candidates.length === opts.limit) break;
      }
      return candidates;
    });
  }
  async reportOutcome(actor: Principal, input: unknown, key: string) {
    if (actor.kind === 'anonymous' || !actor.scopes.includes('outcome'))
      throw new NexusError('authentication_required', 401);
    const body = OutcomeSchema.parse(input);
    if (!body.origin_node || !/^[A-Za-z0-9_.:-]{8,100}$/.test(key))
      throw new NexusError('invalid_federated_outcome');
    return withActor(
      this.pool,
      actor,
      async (db) =>
        (
          await db.query('SELECT nexus.fed_outcome($1,$2,$3,$4,$5,$6,$7,$8) AS result', [
            body.origin_node,
            body.record_id,
            body.revision_id,
            body.outcome,
            JSON.stringify(body.environment),
            body.note,
            key,
            artifactDigest(body),
          ])
        ).rows[0].result,
    );
  }
}

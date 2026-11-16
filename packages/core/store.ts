import { createHash, randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import { z } from 'zod';
import {
  ContentSchema,
  DraftSchema,
  SearchSchema,
  OutcomeSchema,
  ReviewSchema,
  PublishSchema,
  AssessmentSchema,
  type Principal,
  type Content,
  type Draft,
} from '../contracts/index.js';
import { withActor, type Pool, type Connection } from '../db/index.js';
import { NexusError } from './errors.js';
import { compatibility, packContext } from './context.js';

export const digest = (value: unknown) =>
  createHash('sha256')
    .update(canonicalize(value) ?? '')
    .digest('hex');
type Row = {
  id: string;
  revision_id: string;
  content: Content;
  digest: string;
  state: string;
  visibility: string;
  sequence: number;
  created_at: Date;
  can_manage: boolean;
  can_review: boolean;
  assessments?: unknown[];
};
const selectRevision = `SELECT r.id,r.origin_node,r.state,r.visibility,v.id AS revision_id,v.sequence,v.content,v.digest,v.created_at,
  nexus.owns_record(r.id) AS can_manage,nexus.can_review(v.id) AS can_review
  FROM nexus.records r JOIN nexus.record_revisions v ON v.record_id=r.id`;
export class Store {
  constructor(readonly pool: Pool) {}
  private scope(actor: Principal, name: string) {
    if (!actor.scopes.includes(name)) throw new NexusError('forbidden', 403);
  }
  private human(actor: Principal, scope: string) {
    this.scope(actor, scope);
    if (actor.kind !== 'human') throw new NexusError('human_required', 403);
  }
  private async audit(
    db: Connection,
    actor: Principal,
    action: string,
    row: { id: string; revision_id: string },
  ) {
    if (actor.kind === 'anonymous') return;
    await db.query(
      'INSERT INTO nexus.audit_events(actor_id,action,record_id,revision_id) VALUES($1,$2,$3,$4)',
      [actor.id, action, row.id, row.revision_id],
    );
  }
  private async idempotent<T>(
    db: Connection,
    actor: Principal,
    operation: string,
    key: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new NexusError('idempotency_key_required');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${actor.id}:${operation}:${key}`,
    ]);
    const existing = await db.query(
      'SELECT body_digest,result FROM nexus.idempotency WHERE principal_id=$1 AND operation=$2 AND key=$3',
      [actor.id, operation, key],
    );
    const bodyDigest = digest(body);
    if (existing.rowCount) {
      if (existing.rows[0].body_digest !== bodyDigest)
        throw new NexusError('idempotency_conflict', 409);
      return existing.rows[0].result as T;
    }
    const result = JSON.parse(JSON.stringify(await fn())) as T;
    await db.query(
      'INSERT INTO nexus.idempotency(principal_id,operation,key,body_digest,result) VALUES($1,$2,$3,$4,$5)',
      [actor.id, operation, key, bodyDigest, JSON.stringify(result)],
    );
    return result;
  }
  async search(actor: Principal, input: unknown) {
    this.scope(actor, 'read');
    const opts = SearchSchema.parse(input);
    return withActor(this.pool, actor, async (db) => {
      const result = await db.query(
        `${selectRevision}
        WHERE v.id=r.current_revision_id AND r.state='published' AND nexus.can_read_revision(v.id)
        AND ($1='' OR v.search_vector @@ plainto_tsquery('simple',$1))
        AND ($2::text IS NULL OR v.content->>'profile'=$2)
        ORDER BY ts_rank_cd(v.search_vector,plainto_tsquery('simple',$1)) DESC,r.id LIMIT 201`,
        [opts.query, opts.profile ?? null],
      );
      const candidates: Record<string, unknown>[] = [];
      for (const row of (result.rows as Row[]).slice(0, 200)) {
        const match = compatibility(row.content.environment, opts.environment);
        if (match === 'incompatible' || (match === 'unknown' && !opts.include_unknown)) continue;
        const assessments = await db.query(
          'SELECT method,outcome,note,environment,affiliation,independence,created_at FROM nexus.assessments WHERE revision_id=$1 ORDER BY created_at',
          [row.revision_id],
        );
        if (!opts.show_disputed && assessments.rows.some((a) => a.outcome === 'failed')) continue;
        candidates.push({
          id: row.id,
          revision_id: row.revision_id,
          title: row.content.title,
          profile: row.content.profile,
          problem: row.content.problem,
          resolution: row.content.resolution,
          environment: row.content.environment,
          compatibility: match,
          limitations: row.content.limitations,
          sources: row.content.sources,
          rights: row.content.rights,
          evidence: assessments.rows,
          evidence_status: assessments.rows.length ? 'scoped_assessments' : 'unverified',
          demo: true,
          created_at: row.created_at,
        });
        if (candidates.length === opts.limit) break;
      }
      const context = packContext(candidates, opts.budget_bytes, result.rows.length > 200);
      for (const row of context.data)
        await this.audit(db, actor, 'retrieved', {
          id: String(row.id),
          revision_id: String(row.revision_id),
        });
      return context;
    });
  }
  async get(actor: Principal, id: string, revisionId?: string) {
    this.scope(actor, 'read');
    z.uuid().parse(id);
    if (revisionId) z.uuid().parse(revisionId);
    return withActor(this.pool, actor, async (db) => {
      const { rows } = await db.query(
        `${selectRevision} WHERE r.id=$1 AND v.id=coalesce($2::uuid,r.current_revision_id)
        AND nexus.can_read_revision(v.id)`,
        [id, revisionId ?? null],
      );
      const row = rows[0] as Row | undefined;
      if (!row) throw new NexusError('not_found', 404);
      const assessments = await db.query(
        'SELECT id,method,outcome,environment,note,affiliation,independence,created_at FROM nexus.assessments WHERE revision_id=$1 ORDER BY created_at DESC LIMIT 100',
        [row.revision_id],
      );
      const assessmentCounts = await db.query(
        'SELECT outcome,count(*)::integer AS count FROM nexus.assessments WHERE revision_id=$1 GROUP BY outcome',
        [row.revision_id],
      );
      const revisions = await db.query(
        'SELECT id,sequence,digest,created_at FROM nexus.record_revisions WHERE record_id=$1 ORDER BY sequence DESC LIMIT 51',
        [id],
      );
      const jobs = await db.query(
        'SELECT state,attempts,result FROM nexus.review_jobs WHERE revision_id=$1',
        [row.revision_id],
      );
      await this.audit(db, actor, 'viewed', row);
      return {
        ...row,
        assessments: assessments.rows,
        assessment_counts: assessmentCounts.rows,
        assessments_truncated: assessmentCounts.rows.reduce((n, r) => n + r.count, 0) > 100,
        revisions: revisions.rows.slice(0, 50),
        revisions_truncated: revisions.rows.length > 50,
        screening: jobs.rows[0] ?? null,
        demo: true,
      };
    });
  }
  private async insertDraft(db: Connection, actor: Principal, draft: Draft, existingId?: string) {
    const id = existingId ?? randomUUID();
    const revisionId = randomUUID();
    if (!existingId)
      await db.query('INSERT INTO nexus.records(id,owner_id,team_id) VALUES($1,$2,$3)', [
        id,
        actor.owner_id,
        draft.team_id ?? null,
      ]);
    else {
      const r = await db.query(
        'SELECT id FROM nexus.records WHERE id=$1 AND nexus.owns_record(id) FOR UPDATE',
        [id],
      );
      if (!r.rowCount) throw new NexusError('not_found', 404);
      const existingTeam = await db.query('SELECT team_id FROM nexus.records WHERE id=$1', [id]);
      if (draft.team_id && draft.team_id !== existingTeam.rows[0].team_id)
        throw new NexusError('team_change_not_supported');
    }
    const { rows } = await db.query(
      'SELECT coalesce(max(sequence),0)+1 AS next FROM nexus.record_revisions WHERE record_id=$1',
      [id],
    );
    // The intended audience is in the immutable content envelope, not an access grant.
    const content = { ...draft.content, intended_visibility: draft.intended_visibility };
    await db.query(
      'INSERT INTO nexus.record_revisions(id,record_id,sequence,content,digest) VALUES($1,$2,$3,$4,$5)',
      [revisionId, id, rows[0].next, JSON.stringify(content), digest(content)],
    );
    await db.query(
      "UPDATE nexus.records SET current_revision_id=$2,state='draft',visibility='private' WHERE id=$1",
      [id, revisionId],
    );
    const result = {
      id,
      revision_id: revisionId,
      digest: digest(content),
      state: 'draft',
      visibility: 'private',
      demo: true,
    };
    await this.audit(db, actor, 'draft_created', result);
    return result;
  }
  async createDraft(actor: Principal, input: unknown, key: string, existingId?: string) {
    this.scope(actor, 'draft');
    const body = DraftSchema.parse(input);
    if (existingId) z.uuid().parse(existingId);
    return withActor(this.pool, actor, (db) =>
      this.idempotent(db, actor, `draft:${existingId ?? 'new'}`, key, body, () =>
        this.insertDraft(db, actor, body, existingId),
      ),
    );
  }
  async submit(actor: Principal, id: string, revisionId: string, key: string) {
    this.scope(actor, 'draft');
    z.uuid().parse(id);
    z.uuid().parse(revisionId);
    return withActor(this.pool, actor, (db) =>
      this.idempotent(db, actor, 'submit', key, { id, revisionId }, async () => {
        const { rows } = await db.query(
          `SELECT v.id,v.content FROM nexus.records r JOIN nexus.record_revisions v ON v.id=r.current_revision_id
        WHERE r.id=$1 AND v.id=$2 AND r.state='draft' AND nexus.owns_record(r.id) FOR UPDATE OF r`,
          [id, revisionId],
        );
        if (!rows.length) throw new NexusError('stale_or_unavailable_draft', 409);
        // Validate the application fields, excluding the separately frozen intended audience.
        const { intended_visibility: ignored, ...content } = rows[0].content;
        ContentSchema.parse(content);
        await db.query('UPDATE nexus.record_revisions SET submitted=true WHERE id=$1', [
          revisionId,
        ]);
        await db.query("UPDATE nexus.records SET state='quarantined' WHERE id=$1", [id]);
        await db.query('INSERT INTO nexus.review_jobs(revision_id) VALUES($1)', [revisionId]);
        await this.audit(db, actor, 'submitted', { id, revision_id: revisionId });
        return {
          id,
          revision_id: revisionId,
          state: 'quarantined',
          visibility: 'private',
          demo: true,
        };
      }),
    );
  }
  async reportOutcome(actor: Principal, input: unknown, key: string) {
    this.scope(actor, 'outcome');
    const body = OutcomeSchema.parse(input);
    return withActor(this.pool, actor, (db) =>
      this.idempotent(db, actor, 'outcome', key, body, async () => {
        const allowed = await db.query(
          'SELECT 1 FROM nexus.record_revisions WHERE id=$1 AND record_id=$2 AND nexus.can_read_revision(id)',
          [body.revision_id, body.record_id],
        );
        if (!allowed.rowCount) throw new NexusError('not_found', 404);
        const r = await db.query(
          `INSERT INTO nexus.outcomes(reporter_id,record_id,revision_id,outcome,environment,note,method)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at`,
          [
            actor.id,
            body.record_id,
            body.revision_id,
            body.outcome,
            JSON.stringify(body.environment),
            body.note,
            body.method,
          ],
        );
        await this.audit(db, actor, 'outcome_reported', {
          id: body.record_id,
          revision_id: body.revision_id,
        });
        return { ...r.rows[0], visibility: 'private', self_reported: true, demo: true };
      }),
    );
  }
  async review(actor: Principal, input: unknown) {
    this.human(actor, 'review');
    const body = ReviewSchema.parse(input);
    return withActor(this.pool, actor, async (db) => {
      const r = await db.query(
        `SELECT v.id FROM nexus.record_revisions v JOIN nexus.records r ON r.current_revision_id=v.id
        JOIN nexus.review_jobs j ON j.revision_id=v.id
        WHERE r.id=$1 AND v.id=$2 AND v.digest=$3 AND r.state='reviewable'
        AND nexus.can_review(v.id) AND j.state='done' AND j.result->>'blocked'='false'`,
        [body.record_id, body.revision_id, body.digest],
      );
      if (!r.rowCount) throw new NexusError('review_precondition', 409);
      await db.query(
        'INSERT INTO nexus.review_decisions(revision_id,reviewer_id,digest,decision,note) VALUES($1,$2,$3,$4,$5)',
        [body.revision_id, actor.id, body.digest, body.decision, body.note],
      );
      await this.audit(db, actor, 'reviewed', {
        id: body.record_id,
        revision_id: body.revision_id,
      });
      return { decision: body.decision, revision_id: body.revision_id };
    });
  }
  async publish(actor: Principal, input: unknown) {
    this.human(actor, 'publish');
    const body = PublishSchema.parse(input);
    return withActor(this.pool, actor, async (db) => {
      const r = await db.query(
        `SELECT r.id,r.team_id,v.content FROM nexus.records r JOIN nexus.record_revisions v ON r.current_revision_id=v.id
        WHERE r.id=$1 AND v.id=$2 AND v.digest=$3 AND r.state='reviewable' AND nexus.owns_record(r.id) FOR UPDATE OF r`,
        [body.record_id, body.revision_id, body.digest],
      );
      if (!r.rowCount) throw new NexusError('publication_precondition', 409);
      if (
        body.visibility !== r.rows[0].content.intended_visibility ||
        (body.visibility === 'team' && !r.rows[0].team_id)
      )
        throw new NexusError('audience_mismatch', 409);
      await db.query(
        'INSERT INTO nexus.publication_grants(revision_id,owner_id,digest,visibility) VALUES($1,$2,$3,$4)',
        [body.revision_id, actor.owner_id, body.digest, body.visibility],
      );
      await db.query("UPDATE nexus.records SET state='published',visibility=$2 WHERE id=$1", [
        body.record_id,
        body.visibility,
      ]);
      await this.audit(db, actor, 'published', {
        id: body.record_id,
        revision_id: body.revision_id,
      });
      return {
        id: body.record_id,
        revision_id: body.revision_id,
        visibility: body.visibility,
        state: 'published',
      };
    });
  }
  async withdraw(actor: Principal, id: string) {
    this.human(actor, 'withdraw');
    z.uuid().parse(id);
    return withActor(this.pool, actor, async (db) => {
      const r = await db.query(
        "UPDATE nexus.records SET state='withdrawn',visibility='private' WHERE id=$1 AND nexus.owns_record(id) RETURNING current_revision_id",
        [id],
      );
      if (!r.rowCount) throw new NexusError('not_found', 404);
      await db.query(
        'UPDATE nexus.publication_grants SET revoked_at=now() WHERE revision_id IN (SELECT id FROM nexus.record_revisions WHERE record_id=$1)',
        [id],
      );
      await this.audit(db, actor, 'withdrawn', { id, revision_id: r.rows[0].current_revision_id });
      return { id, state: 'withdrawn' };
    });
  }
  async addAssessment(actor: Principal, input: unknown) {
    this.human(actor, 'review');
    const body = AssessmentSchema.parse(input);
    return withActor(this.pool, actor, async (db) => {
      const r = await db.query(
        `INSERT INTO nexus.assessments(record_id,revision_id,assessor_id,method,outcome,environment,note,affiliation,independence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          body.record_id,
          body.revision_id,
          actor.id,
          body.method,
          body.outcome,
          JSON.stringify(body.environment),
          body.note,
          body.affiliation,
          body.independence,
        ],
      );
      return { id: r.rows[0].id };
    });
  }
  async drafts(actor: Principal) {
    this.scope(actor, 'read');
    return withActor(
      this.pool,
      actor,
      async (db) =>
        (
          await db.query(`${selectRevision} WHERE v.id=r.current_revision_id
      AND r.state<>'published' ORDER BY r.created_at DESC LIMIT 100`)
        ).rows,
    );
  }
  async activity(actor: Principal) {
    this.scope(actor, 'read');
    if (actor.kind === 'anonymous') throw new NexusError('authentication_required', 401);
    return withActor(this.pool, actor, async (db) => ({
      events: (
        await db.query(`SELECT e.id,e.action,e.record_id,e.revision_id,e.created_at,v.content->>'title' AS title
        FROM nexus.audit_events e LEFT JOIN nexus.record_revisions v ON v.id=e.revision_id
        ORDER BY e.created_at DESC LIMIT 100`)
      ).rows,
      outcomes: (
        await db.query(`SELECT o.id,o.record_id,o.revision_id,o.outcome,o.note,o.environment,o.self_reported,o.created_at,
        v.content->>'title' AS title FROM nexus.outcomes o LEFT JOIN nexus.record_revisions v ON v.id=o.revision_id
        ORDER BY o.created_at DESC LIMIT 100`)
      ).rows,
      demo: true,
    }));
  }
}

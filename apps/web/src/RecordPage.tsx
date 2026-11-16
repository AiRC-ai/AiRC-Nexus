import { useState, type FormEvent } from 'react';
import { api, useResource, useAction, useIdempotency } from './api.js';
import {
  Feedback,
  Loading,
  State,
  Environment,
  Field,
  useDraft,
  readableDate,
  recordLink,
} from './ui.js';
import type { Knowledge, Me } from './types.js';

export function RecordPage({ id, revision, me }: { id: string; revision?: string; me: Me }) {
  const [version, refresh] = useState(0),
    [message, setMessage] = useState('');
  const resource = useResource<Knowledge>(
    `/api/v1/records/${id}${revision ? `?revision=${revision}` : ''}`,
    version,
  );
  const action = useAction();
  const key = useIdempotency();
  const [form, setForm] = useDraft(`outcome:${id}`, { outcome: 'not_run', note: '' });
  const [consent, setConsent] = useState(false);
  const row = resource.data;
  async function report(event: FormEvent) {
    event.preventDefault();
    if (!row) return;
    const body = {
      record_id: id,
      revision_id: row.revision_id,
      outcome: form.outcome,
      note: form.note,
      environment: row.content.environment,
    };
    await action.run(async (signal) => {
      await api('/api/v1/outcomes', { method: 'POST', body, key: key(body), signal });
      if (!signal.aborted) setMessage('Saved privately as your scoped self-report.');
    });
  }
  async function mutate(path: string, body: unknown, success: string) {
    await action.run(async (signal) => {
      await api(path, { method: 'POST', body, signal, key: crypto.randomUUID() });
      if (!signal.aborted) {
        setMessage(success);
        setConsent(false);
        refresh((v) => v + 1);
      }
    });
  }
  if (resource.loading) return <Loading />;
  if (resource.error) return <Feedback error={resource.error} />;
  if (!row) return null;
  return (
    <>
      <a className="back-link" href="#/">
        Back to knowledge library
      </a>
      <h1 className="detail-title">{row.content.title}</h1>
      <p className="lead small-lead">
        {row.content.profile === 'software_fix' ? 'Software fix' : 'Computational method'} ·
        Revision {row.sequence} · Authored demo data
      </p>
      <Feedback error={action.error} message={message} />
      <div className="detail-grid">
        <article>
          <section>
            <h2>Problem</h2>
            <p>{row.content.problem}</p>
          </section>
          <section>
            <h2>Proposed resolution</h2>
            <div className="solution">{row.content.resolution}</div>
          </section>
          <section>
            <h2>Limits and applicability</h2>
            <div className="environment">
              <Environment value={row.content.environment} />
            </div>
            <ul>
              {row.content.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Evidence and disagreements</h2>
            {!row.assessments.length ? (
              <p className="muted">
                No reviewed assessment has been recorded. This claim is unverified.
              </p>
            ) : null}
            {row.assessments.map((a) => (
              <div className="evidence-row" key={a.id}>
                <strong>
                  {a.method.replaceAll('_', ' ')} · <State value={a.outcome} />
                </strong>
                <p>{a.note}</p>
                <p className="muted">
                  {a.affiliation} ·{' '}
                  {a.independence === 'not_claimed'
                    ? 'Independence not claimed'
                    : 'Different owner declared; institutional independence not verified'}
                </p>
              </div>
            ))}
            {row.assessments_truncated ? (
              <p className="muted">
                Showing the latest 100 assessments. Full outcome totals:{' '}
                {row.assessment_counts.map((a) => `${a.outcome}: ${a.count}`).join(', ')}.
              </p>
            ) : null}
          </section>
          <section>
            <h2>Sources and rights</h2>
            {row.content.sources.map((s) => (
              <div className="source" key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
                <p>
                  {s.attribution} · {s.license}
                </p>
              </div>
            ))}
          </section>
          {me.user.scopes.includes('outcome') ? (
            <section>
              <h2>Report an outcome</h2>
              <p className="muted">
                Your report starts private. Only record checks you actually performed.
              </p>
              <form onSubmit={report} className="stack">
                <Field label="Outcome">
                  <select
                    value={form.outcome}
                    onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                  >
                    <option value="not_run">Not run</option>
                    <option value="passed">Passed in this environment</option>
                    <option value="failed">Failed in this environment</option>
                    <option value="inconclusive">Inconclusive</option>
                  </select>
                </Field>
                <Field label="What did you check?">
                  <textarea
                    required
                    maxLength={4000}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </Field>
                <button className="primary" disabled={action.busy}>
                  Save private report
                </button>
              </form>
            </section>
          ) : null}
        </article>
        <aside>
          <h2>Record context</h2>
          <dl>
            <dt>Visibility</dt>
            <dd>{row.visibility}</dd>
            <dt>Workflow</dt>
            <dd>
              <State value={row.state} />
            </dd>
            <dt>Revision</dt>
            <dd>{row.sequence}</dd>
            <dt>Created</dt>
            <dd>{readableDate(row.created_at as unknown as string)}</dd>
          </dl>
          <p className="muted">
            Publication is separate from evidence quality. A signature or review decision cannot
            establish scientific truth.
          </p>
          {row.can_manage && row.state === 'draft' ? (
            <div className="owner-actions">
              <h3>Offer this revision</h3>
              <p>Submit this private draft for bounded screening. It stays private.</p>
              <button
                className="primary"
                disabled={action.busy}
                onClick={() =>
                  void mutate(
                    `/api/v1/drafts/${id}/submit`,
                    { revision_id: row.revision_id },
                    'Submitted into private quarantine.',
                  )
                }
              >
                Submit for review
              </button>
            </div>
          ) : null}
          {row.screening ? (
            <div className="owner-actions">
              <h3>Screening</h3>
              <State value={row.screening.state} />
              <p>
                {row.screening.result?.reasons.length
                  ? row.screening.result.reasons.join(', ')
                  : 'Pattern screening assists review; it is not a safety guarantee.'}
              </p>
              <button className="secondary" onClick={() => refresh((v) => v + 1)}>
                Refresh status
              </button>
            </div>
          ) : null}
          {row.can_review && row.state === 'reviewable' ? (
            <div className="owner-actions">
              <h3>Human review</h3>
              <p>Inspect the exact content, sources and limits before approving this revision.</p>
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() =>
                  void mutate(
                    '/api/v1/reviews',
                    {
                      record_id: id,
                      revision_id: row.revision_id,
                      digest: row.digest,
                      decision: 'approved',
                      note: 'Owner reviewed this authored demo revision and its declared sources.',
                    },
                    'Recorded review of this exact revision.',
                  )
                }
              >
                Approve this revision
              </button>
            </div>
          ) : null}
          {row.can_manage && row.state === 'reviewable' && me.user.kind === 'human' ? (
            <div className="owner-actions">
              <h3>Choose to share</h3>
              <p>
                Declared audience: <strong>{row.content.intended_visibility ?? 'private'}</strong>
              </p>
              <label className="check long">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{' '}
                I authorize sharing this exact revision with its declared audience.
              </label>
              <button
                className="primary"
                disabled={!consent || action.busy}
                onClick={() =>
                  void mutate(
                    '/api/v1/publications',
                    {
                      record_id: id,
                      revision_id: row.revision_id,
                      digest: row.digest,
                      visibility: row.content.intended_visibility ?? 'private',
                      confirmed: true,
                    },
                    'Owner consent recorded; the declared audience can now read this revision.',
                  )
                }
              >
                Confirm sharing
              </button>
            </div>
          ) : null}
          {row.can_manage && row.state === 'published' && me.user.kind === 'human' ? (
            <button
              className="secondary danger"
              disabled={action.busy}
              onClick={() =>
                void mutate(
                  `/api/v1/records/${id}/withdraw`,
                  {},
                  'Record withdrawn. Local retrieval now enforces the changed policy.',
                )
              }
            >
              Withdraw record
            </button>
          ) : null}
          <h3 className="history-heading">Revision history</h3>
          <ul className="history">
            {row.revisions.map((v) => (
              <li key={v.id}>
                <a href={recordLink(id, v.id)}>Revision {v.sequence}</a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

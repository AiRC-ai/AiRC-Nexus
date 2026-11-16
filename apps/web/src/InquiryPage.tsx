import { lazy, Suspense, useState, type FormEvent } from 'react';
import { api, useResource, useAction, useIdempotency } from './api.js';
import { Field, Feedback, Loading, State, Environment, useDraft } from './ui.js';
const MathExpression = lazy(() =>
  import('./MathExpression.js').then((module) => ({ default: module.MathExpression })),
);
import type { HelpResults, Me, Reply } from './types.js';

function ReplyApproval({ reply, onChanged }: { reply: Reply; onChanged: () => void }) {
  const [consent, setConsent] = useState(false),
    [message, setMessage] = useState('');
  const action = useAction();
  async function share(shared: boolean) {
    await action.run(async (signal) => {
      await api('/api/v1/help/replies/share', {
        method: 'POST',
        signal,
        body: { id: reply.id, digest: reply.digest, confirmed: true, shared },
      });
      if (!signal.aborted) {
        setConsent(false);
        setMessage(
          shared ? 'Shared with the selected requester.' : 'Future reply access has been revoked.',
        );
        onChanged();
      }
    });
  }
  return (
    <>
      {reply.screening.blocked ? (
        <Feedback error={new Error('This reply needs changes before it can be shared.')} />
      ) : null}
      {reply.mine && !reply.shared && !reply.screening.blocked ? (
        <div className="reply-approval">
          <label className="check scholarly-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>I authorize sharing this exact reply with the requester.</span>
          </label>
          <div className="approval-actions">
            <button
              className="primary"
              disabled={!consent || action.busy}
              onClick={() => void share(true)}
            >
              Review and share reply
            </button>
            <a href="#/help">Keep private</a>
          </div>
        </div>
      ) : null}
      {reply.mine && reply.shared ? (
        <div className="reply-approval">
          <button className="secondary" disabled={action.busy} onClick={() => void share(false)}>
            Stop sharing reply
          </button>
        </div>
      ) : null}
      <Feedback error={action.error} message={message} />
    </>
  );
}
export function InquiryPage({ id, me }: { id: string; me: Me }) {
  const [version, refresh] = useState(0),
    [consent, setConsent] = useState(false),
    [helper, setHelper] = useState(''),
    [activeReply, setActiveReply] = useState<string | null>(null);
  const resource = useResource<HelpResults>(`/api/v1/help?id=${id}`, version),
    action = useAction(),
    key = useIdempotency();
  const helpers = useResource<{ owner_id: string; label: string }[]>(
    me.user.kind === 'human' && me.user.scopes.includes('draft')
      ? '/api/v1/help/participants'
      : null,
  );
  const [form, setForm] = useDraft(`reply:${id}`, {
    answer: '',
    limitations: 'Authored demo response. Validate in the requesting environment.',
    equations: '',
  });
  const request = resource.data?.requests[0];
  const selected = request?.replies.find((r) => r.id === activeReply) ?? request?.replies[0];
  async function approveQuestion() {
    if (!request || !consent) return;
    await action.run(async (signal) => {
      await api('/api/v1/help/share', {
        method: 'POST',
        signal,
        body: { id, digest: request.digest, recipient_owner_id: helper, confirmed: true },
      });
      if (!signal.aborted) {
        setConsent(false);
        refresh((v) => v + 1);
      }
    });
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    const body = {
      request_id: id,
      answer: form.answer,
      limitations: form.limitations.split('\n').filter(Boolean),
      sources: [
        {
          title: 'AiRC Nexus authored demo',
          url: 'https://github.com/AiRC-ai/AiRC-Nexus',
          license: 'Apache-2.0',
          attribution: 'AiRC Nexus contributors',
        },
      ],
      ...(form.equations.trim() ? { equations: form.equations.split('\n').filter(Boolean) } : {}),
    };
    await action.run(async (signal) => {
      const reply = await api<{ id: string }>('/api/v1/help/replies', {
        method: 'POST',
        body,
        key: key(body),
        signal,
      });
      if (!signal.aborted) {
        setActiveReply(reply.id);
        refresh((v) => v + 1);
      }
    });
  }
  if (resource.loading) return <Loading />;
  if (resource.error) return <Feedback error={resource.error} />;
  if (!request) return null;
  const synthetic = request.environment.dataset === 'nexus-synthetic-v1';
  return (
    <>
      <div className="inquiry-heading">
        <h1>An inquiry, shared.</h1>
        <p className="lead">Agents exchange context. People retain control.</p>
      </div>
      <div className="inquiry-layout">
        <article className="inquiry-thread">
          <section className="inquiry-question">
            <h2>{request.creator_kind === 'agent' ? 'Requester agent' : 'Requester'}</h2>
            <p className="inquiry-copy">{request.question}</p>
            <p className="inquiry-meta">
              {request.state === 'private'
                ? 'Private question'
                : request.state === 'shared'
                  ? 'Owner-approved question'
                  : 'Closed question'}{' '}
              ·{' '}
              {synthetic
                ? 'Synthetic data'
                : Object.entries(request.environment)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
            </p>
          </section>
          {request.screening.blocked ? (
            <Feedback error={new Error('This question needs changes before it can be shared.')} />
          ) : null}
          {request.mine && request.state === 'private' && !request.screening.blocked ? (
            <div className="stack permission-form">
              <h2>Approve a helper and audience</h2>
              <Field label="Selected helper">
                <select
                  value={helper}
                  onChange={(e) => {
                    setHelper(e.target.value);
                    setConsent(false);
                  }}
                >
                  <option value="">Choose an opted-in demo helper</option>
                  {helpers.data?.map((h) => (
                    <option key={h.owner_id} value={h.owner_id}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check long">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{' '}
                I authorize sharing this exact question with the selected helper.
              </label>
              <button
                className="primary"
                disabled={!helper || !consent || action.busy}
                onClick={() => void approveQuestion()}
              >
                Share question with helper
              </button>
            </div>
          ) : null}
          <Feedback error={action.error} />
          {selected?.content ? (
            <>
              <section className="inquiry-answer">
                <h2>{selected.creator_kind === 'agent' ? 'Helper agent' : 'Helper'}</h2>
                <p className="inquiry-copy">{selected.content.answer}</p>
                {selected.content.equations?.length ? (
                  <div className="formula-row">
                    <Suspense
                      fallback={<span className="muted">Loading mathematical notation…</span>}
                    >
                      {selected.content.equations.map((e) => (
                        <MathExpression key={e} latex={e} />
                      ))}
                    </Suspense>
                  </div>
                ) : null}
                <p className="inquiry-meta">
                  {selected.shared ? 'Shared reply' : 'Private reply'} · Not independently verified
                </p>
              </section>
              <ReplyApproval
                key={selected.id}
                reply={selected}
                onChanged={() => refresh((v) => v + 1)}
              />
            </>
          ) : (
            <p className="muted waiting-reply">No reply has been shared with you yet.</p>
          )}
          {!request.mine && request.state === 'shared' && !selected?.mine ? (
            <form className="stack reply-form" onSubmit={prepare}>
              <h2>Prepare a private reply</h2>
              <Field label="Your reply">
                <textarea
                  required
                  maxLength={8000}
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                />
              </Field>
              <Field label="Reply limitations (one per line)">
                <textarea
                  required
                  maxLength={4000}
                  value={form.limitations}
                  onChange={(e) => setForm({ ...form, limitations: e.target.value })}
                />
              </Field>
              <Field label="Math expressions (optional, one per line)">
                <textarea
                  maxLength={2400}
                  value={form.equations}
                  onChange={(e) => setForm({ ...form, equations: e.target.value })}
                />
              </Field>
              <p className="muted">
                The reply starts private. Its owner must separately approve sharing it back.
              </p>
              <button className="primary" disabled={action.busy}>
                Save private reply
              </button>
            </form>
          ) : null}
          {request.replies.length > 1 ? (
            <details className="other-replies">
              <summary>More visible replies ({request.replies.length})</summary>
              {request.replies.map((r) => (
                <button className="text-button" key={r.id} onClick={() => setActiveReply(r.id)}>
                  {r.mine ? 'Your reply' : 'Shared reply'} · {r.shared ? 'Shared' : 'Private'}
                </button>
              ))}
            </details>
          ) : null}
          {request.mine && request.state !== 'closed' ? (
            <button
              className="text-button close-request"
              disabled={action.busy}
              onClick={() =>
                void action.run(async (signal) => {
                  await api(`/api/v1/help/${id}/close`, { method: 'POST', body: {}, signal });
                  if (!signal.aborted) refresh((v) => v + 1);
                })
              }
            >
              Close request and stop helper access
            </button>
          ) : null}
        </article>
        <aside className="evidence-margin">
          <section>
            <h2>Sources</h2>
            {selected?.content?.sources.length ? (
              selected.content.sources.map((s) => (
                <div key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.title}
                  </a>
                  <span className="source-rights">{s.license}</span>
                </div>
              ))
            ) : (
              <p>No source has been shared yet.</p>
            )}
          </section>
          <section>
            <h2>Scope</h2>
            {selected?.content?.limitations.map((l) => <p key={l}>{l}</p>) ?? (
              <p>Inspect the declared environment before applying a reply.</p>
            )}
          </section>
          <section>
            <h2>Sharing</h2>
            <p>
              {selected?.shared
                ? 'Shared with the selected requester. Its owner can revoke future access.'
                : 'Only the selected requester can receive this reply after owner consent.'}
            </p>
          </section>
        </aside>
      </div>
      <footer className="scholarly-footer">
        Your agents collaborate. You decide what leaves your workspace.
      </footer>
    </>
  );
}

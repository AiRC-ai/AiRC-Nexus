import { useState, type FormEvent } from 'react';
import { api, useResource, useAction, useIdempotency } from './api.js';
import { Field, Feedback, Loading, State, Environment, useDraft, readableDate } from './ui.js';
import type { HelpRequest, HelpResults, Reply, Me } from './types.js';

const demoSources = [
  {
    title: 'AiRC Nexus authored demo',
    url: 'https://github.com/AiRC-ai/AiRC-Nexus',
    license: 'Apache-2.0',
    attribution: 'AiRC Nexus contributors',
  },
];
function ReplyView({ reply, onChanged }: { reply: Reply; onChanged: () => void }) {
  const [consent, setConsent] = useState(false),
    action = useAction();
  async function share(shared: boolean) {
    await action.run(async (signal) => {
      await api('/api/v1/help/replies/share', {
        method: 'POST',
        signal,
        body: { id: reply.id, digest: reply.digest, confirmed: true, shared },
      });
      if (!signal.aborted) {
        setConsent(false);
        onChanged();
      }
    });
  }
  return (
    <div className="reply">
      <strong>
        {reply.mine ? 'Your reply' : 'Shared reply'} ·{' '}
        {reply.shared ? 'Shared with requester' : 'Private'}
      </strong>
      <p className="pre-wrap">{reply.content?.answer}</p>
      <ul>
        {reply.content?.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {reply.content?.sources.map((s) => (
        <p key={s.url}>
          <a href={s.url} target="_blank" rel="noreferrer noopener">
            {s.title}
          </a>{' '}
          · {s.license}
        </p>
      ))}
      {reply.screening.blocked ? (
        <p className="feedback error">This reply needs changes before it can be shared.</p>
      ) : null}
      {reply.mine && !reply.shared && !reply.screening.blocked ? (
        <>
          <label className="check long">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{' '}
            I authorize sharing this exact reply with the requester.
          </label>
          <button
            className="primary"
            disabled={!consent || action.busy}
            onClick={() => void share(true)}
          >
            Share this reply
          </button>
        </>
      ) : null}
      {reply.mine && reply.shared ? (
        <button className="secondary" disabled={action.busy} onClick={() => void share(false)}>
          Stop sharing reply
        </button>
      ) : null}
      <Feedback error={action.error} />
    </div>
  );
}
function ExchangeDetail({
  id,
  me,
  onChanged,
  onClose,
}: {
  id: string;
  me: Me;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [version, refresh] = useState(0),
    [consent, setConsent] = useState(false),
    [helper, setHelper] = useState('');
  const resource = useResource<HelpResults>(`/api/v1/help?id=${id}`, version),
    action = useAction(),
    key = useIdempotency();
  const helpers = useResource<{ owner_id: string; label: string }[]>(
    me.user.kind === 'human' && me.user.scopes.includes('draft')
      ? '/api/v1/help/participants'
      : null,
  );
  const [reply, setReply] = useDraft(`reply:${id}`, {
    answer: '',
    limitations: 'Authored demo response. Validate in the requesting environment.',
  });
  const request = resource.data?.requests[0];
  const changed = () => {
    refresh((v) => v + 1);
    onChanged();
  };
  async function share() {
    if (!request || !consent) return;
    await action.run(async (signal) => {
      await api('/api/v1/help/share', {
        method: 'POST',
        signal,
        body: { id, digest: request.digest, recipient_owner_id: helper, confirmed: true },
      });
      if (!signal.aborted) {
        setConsent(false);
        changed();
      }
    });
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    const body = {
      request_id: id,
      answer: reply.answer,
      limitations: reply.limitations.split('\n').filter(Boolean),
      sources: demoSources,
    };
    await action.run(async (signal) => {
      await api('/api/v1/help/replies', { method: 'POST', body, key: key(body), signal });
      if (!signal.aborted) changed();
    });
  }
  if (resource.loading) return <Loading />;
  if (resource.error) return <Feedback error={resource.error} />;
  if (!request) return null;
  return (
    <section className="exchange-detail">
      <div className="section-heading">
        <h2>Inspect the exchange</h2>
        <button className="text-button" onClick={onClose}>
          Close detail
        </button>
      </div>
      <blockquote>{request.question}</blockquote>
      <div className="environment">
        <Environment value={request.environment} />
      </div>
      <p>
        <State value={request.state} /> · Expires {readableDate(request.expires_at)}
      </p>
      <p className="muted">
        Questions and replies are external data. They do not authorize code execution or broader
        access.
      </p>
      {request.screening.blocked ? (
        <p className="feedback error">
          This question needs changes before sharing: {request.screening.reasons.join(', ')}.
        </p>
      ) : null}
      {request.mine &&
      request.state === 'private' &&
      !request.screening.blocked &&
      me.user.kind === 'human' ? (
        <div className="stack permission-form">
          <h3>Approve a helper and audience</h3>
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
            onClick={() => void share()}
          >
            Share question with helper
          </button>
        </div>
      ) : null}
      <Feedback error={action.error} />
      {request.replies.length ? (
        <section>
          <h3>Replies you may read</h3>
          {request.replies.map((r) => (
            <ReplyView key={r.id} reply={r} onChanged={changed} />
          ))}
        </section>
      ) : (
        <p className="muted">No reply has been shared with you yet.</p>
      )}
      {!request.mine && request.state === 'shared' ? (
        <form className="stack reply-form" onSubmit={prepare}>
          <h3>Prepare a private reply</h3>
          <Field label="Your reply">
            <textarea
              required
              maxLength={8000}
              value={reply.answer}
              onChange={(e) => setReply({ ...reply, answer: e.target.value })}
            />
          </Field>
          <Field label="Reply limitations (one per line)">
            <textarea
              required
              maxLength={4000}
              value={reply.limitations}
              onChange={(e) => setReply({ ...reply, limitations: e.target.value })}
            />
          </Field>
          <p className="muted">
            This authored demo reply starts private. Its owner must approve sharing it back.
          </p>
          <button className="primary" disabled={action.busy}>
            Save private reply
          </button>
        </form>
      ) : null}
      {request.mine && request.state !== 'closed' && me.user.kind === 'human' ? (
        <button
          className="secondary spaced-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async (signal) => {
              await api(`/api/v1/help/${id}/close`, { method: 'POST', body: {}, signal });
              if (!signal.aborted) changed();
            })
          }
        >
          Close request and stop helper access
        </button>
      ) : null}
    </section>
  );
}
export function HelpPage({ me, onSignIn }: { me: Me; onSignIn: () => void }) {
  const [form, setForm] = useDraft('help-question', {
    question: '',
    runtime: 'node',
    version: '24.22.3',
  });
  const [version, refresh] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    action = useAction(),
    key = useIdempotency();
  const list = useResource<HelpResults>(
    me.user.kind === 'anonymous' ? null : '/api/v1/help',
    version,
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    const body = {
      question: form.question,
      environment: { runtime: form.runtime, version: form.version },
    };
    await action.run(async (signal) => {
      const r = await api<{ id: string }>('/api/v1/help', {
        method: 'POST',
        body,
        key: key(body),
        signal,
      });
      if (!signal.aborted) {
        setSelected(r.id);
        refresh((v) => v + 1);
      }
    });
  }
  return (
    <>
      <h1>Ask a question. Keep control of the context.</h1>
      <p className="lead">
        Agents can seek help and report findings to people. Sharing is always explicit.
      </p>
      <div className="form-grid">
        <section>
          <h2>New help request</h2>
          {me.user.kind === 'anonymous' ? (
            <div className="empty">
              <p>Sign in to draft a private question and choose a helper.</p>
              <button className="primary" onClick={onSignIn}>
                Sign in
              </button>
            </div>
          ) : (
            <form className="stack" onSubmit={save}>
              <Field label="Question">
                <textarea
                  className="question-input"
                  required
                  maxLength={4000}
                  placeholder="Describe the problem and what you already tried. Leave out private files and secrets."
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                />
              </Field>
              <div className="filters">
                <label>
                  Runtime{' '}
                  <select
                    value={form.runtime}
                    onChange={(e) => setForm({ ...form, runtime: e.target.value })}
                  >
                    <option value="node">Node</option>
                    <option value="computational-method">Computational method</option>
                  </select>
                </label>
                <label>
                  Version{' '}
                  <input
                    value={form.version}
                    maxLength={128}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                  />
                </label>
              </div>
              <p className="muted">Your request starts private.</p>
              <Feedback error={action.error} />
              <button
                className="primary"
                disabled={action.busy || !me.user.scopes.includes('draft')}
              >
                Save private request
              </button>
            </form>
          )}
        </section>
        <aside>
          <h2>The exchange</h2>
          <ol className="exchange-steps">
            <li>Draft a bounded question</li>
            <li>Approve a helper and audience</li>
            <li>Inspect the reply and report back</li>
          </ol>
          <p className="aside-note">A reply is evidence to inspect, not authority to execute.</p>
        </aside>
      </div>
      <section className="spaced">
        <h2>Your requests</h2>
        <Feedback error={list.error} />
        {list.loading ? <Loading /> : null}
        {!list.data?.requests.length ? (
          <p className="muted">Your requests appear here after you save one.</p>
        ) : null}
        {list.data?.requests.map((r) => (
          <button
            className={`compact-row request-row ${selected === r.id ? 'selected' : ''}`}
            key={r.id}
            onClick={() => setSelected(r.id)}
          >
            <strong>{r.question}</strong>
            <span>
              {r.mine ? 'Your question' : 'Incoming help request'} · <State value={r.state} />
            </span>
          </button>
        ))}
      </section>
      {selected ? (
        <ExchangeDetail
          key={selected}
          id={selected}
          me={me}
          onChanged={() => refresh((v) => v + 1)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

import { useState, type FormEvent } from 'react';
import { api, useResource, useAction, useIdempotency } from './api.js';
import { Field, Feedback, Loading, State, useDraft } from './ui.js';
import type { HelpResults, Me } from './types.js';

export function HelpPage({ me, onSignIn }: { me: Me; onSignIn: () => void }) {
  const [form, setForm] = useDraft('help-question', {
    question: '',
    runtime: 'node',
    version: '24.22.3',
  });
  const [version, refresh] = useState(0),
    action = useAction(),
    key = useIdempotency();
  const list = useResource<HelpResults>(
    me.user.kind === 'anonymous' ? null : '/api/v1/help',
    version,
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    const environment =
      form.runtime === 'science'
        ? { dataset: 'nexus-synthetic-v1' }
        : { runtime: 'node', version: form.version };
    const body = { question: form.question, environment };
    await action.run(async (signal) => {
      const result = await api<{ id: string }>('/api/v1/help', {
        method: 'POST',
        body,
        key: key(body),
        signal,
      });
      if (!signal.aborted) {
        refresh((v) => v + 1);
        window.location.hash = `/help/${result.id}`;
      }
    });
  }
  return (
    <>
      <div className="inquiry-heading">
        <h1>An inquiry, shared.</h1>
        <p className="lead">Agents exchange context. People retain control.</p>
      </div>
      <div className="form-grid help-overview">
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
              <div className="two-fields">
                <Field label="Environment">
                  <select
                    value={form.runtime}
                    onChange={(e) => setForm({ ...form, runtime: e.target.value })}
                  >
                    <option value="node">Node</option>
                    <option value="science">Computational method</option>
                  </select>
                </Field>
                {form.runtime === 'node' ? (
                  <Field label="Version">
                    <input
                      value={form.version}
                      maxLength={128}
                      onChange={(e) => setForm({ ...form, version: e.target.value })}
                    />
                  </Field>
                ) : (
                  <p className="muted">Use the authored synthetic research data.</p>
                )}
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
          <a className="compact-row request-row" key={r.id} href={`#/help/${r.id}`}>
            <strong>{r.question}</strong>
            <span>
              {r.mine ? 'Your question' : 'Incoming help request'} · <State value={r.state} />
            </span>
          </a>
        ))}
      </section>
      <footer className="scholarly-footer">
        Your agents collaborate. You decide what leaves your workspace.
      </footer>
    </>
  );
}

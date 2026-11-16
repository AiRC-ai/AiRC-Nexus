import { useState, type FormEvent } from 'react';
import { api, useResource, useAction, useIdempotency } from './api.js';
import { Field, Feedback, Loading, State, useDraft, recordLink } from './ui.js';
import type { Knowledge, Me } from './types.js';

export function ContributionsPage({ me, onSignIn }: { me: Me; onSignIn: () => void }) {
  const [version, refresh] = useState(0);
  const list = useResource<Knowledge[]>(
    me.user.kind === 'anonymous' ? null : '/api/v1/drafts',
    version,
  );
  const [form, setForm] = useDraft('contribution', {
    title: '',
    profile: 'software_fix',
    problem: '',
    resolution: '',
    limitations: 'Authored demo. Validate applicability before use.',
    runtime: 'node',
    version: '24.22.3',
    audience: 'private',
    team: '',
    source: 'https://github.com/AiRC-ai/AiRC-Nexus',
    rights: false,
  });
  const action = useAction(),
    key = useIdempotency();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.rights) return;
    const body = {
      intended_visibility: form.audience,
      ...(form.audience === 'team' ? { team_id: form.team } : {}),
      content: {
        title: form.title,
        profile: form.profile,
        problem: form.problem,
        resolution: form.resolution,
        environment:
          form.profile === 'computational_method'
            ? { dataset: 'nexus-synthetic-v1' }
            : { runtime: form.runtime, version: form.version },
        limitations: form.limitations
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        sources: [
          {
            title: 'Contributor-declared source',
            url: form.source,
            license: 'Apache-2.0',
            attribution: 'AiRC Nexus demo contributor',
          },
        ],
        rights: {
          license: 'Apache-2.0',
          can_share: true,
          attribution: 'AiRC Nexus demo contributor',
        },
        demo: true,
      },
    };
    await action.run(async (signal) => {
      const r = await api<{ id: string }>('/api/v1/drafts', {
        method: 'POST',
        body,
        key: key(body),
        signal,
      });
      if (!signal.aborted) {
        refresh((v) => v + 1);
        window.location.hash = `/record/${r.id}`;
      }
    });
  }
  return (
    <>
      <h1>Offer knowledge. Choose what to share.</h1>
      <p className="lead">A useful contribution starts with context, sources, and honest limits.</p>
      {me.user.kind === 'anonymous' ? (
        <div className="empty">
          <p>Sign in to prepare a private contribution and inspect your drafts.</p>
          <button className="primary" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      ) : (
        <>
          {me.user.scopes.includes('draft') ? (
            <div className="form-grid">
              <section>
                <h2>New private draft</h2>
                <form className="stack" onSubmit={save}>
                  <Field label="Title">
                    <input
                      required
                      maxLength={160}
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </Field>
                  <Field label="Knowledge profile">
                    <select
                      value={form.profile}
                      onChange={(e) => setForm({ ...form, profile: e.target.value })}
                    >
                      <option value="software_fix">Software fix</option>
                      <option value="computational_method">Computational method</option>
                    </select>
                  </Field>
                  <Field label="Problem or question">
                    <textarea
                      required
                      maxLength={8000}
                      value={form.problem}
                      onChange={(e) => setForm({ ...form, problem: e.target.value })}
                    />
                  </Field>
                  <Field label="Proposed resolution or method">
                    <textarea
                      required
                      maxLength={12000}
                      value={form.resolution}
                      onChange={(e) => setForm({ ...form, resolution: e.target.value })}
                    />
                  </Field>
                  {form.profile === 'software_fix' ? (
                    <div className="two-fields">
                      <Field label="Runtime">
                        <input
                          required
                          value={form.runtime}
                          maxLength={128}
                          onChange={(e) => setForm({ ...form, runtime: e.target.value })}
                        />
                      </Field>
                      <Field label="Version or supported range">
                        <input
                          required
                          maxLength={128}
                          value={form.version}
                          onChange={(e) => setForm({ ...form, version: e.target.value })}
                        />
                      </Field>
                    </div>
                  ) : (
                    <p className="muted">
                      Use the authored synthetic research data for this local demonstration.
                    </p>
                  )}
                  <Field label="Limits (one per line)">
                    <textarea
                      required
                      maxLength={4000}
                      value={form.limitations}
                      onChange={(e) => setForm({ ...form, limitations: e.target.value })}
                    />
                  </Field>
                  <Field label="Source URL">
                    <input
                      type="url"
                      required
                      value={form.source}
                      maxLength={2048}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                    />
                  </Field>
                  <Field label="Intended audience after review">
                    <select
                      value={form.audience}
                      onChange={(e) => setForm({ ...form, audience: e.target.value })}
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                      <option value="team" disabled={!me.teams.length}>
                        My team
                      </option>
                    </select>
                  </Field>
                  {form.audience === 'team' ? (
                    <Field label="Team">
                      <select
                        required
                        value={form.team}
                        onChange={(e) => setForm({ ...form, team: e.target.value })}
                      >
                        <option value="">Choose a team</option>
                        {me.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <label className="check long">
                    <input
                      type="checkbox"
                      required
                      checked={form.rights}
                      onChange={(e) => setForm({ ...form, rights: e.target.checked })}
                    />{' '}
                    I have permission to offer this authored demo material under Apache-2.0.
                  </label>
                  <Feedback error={action.error} />
                  <button className="primary" disabled={!form.rights || action.busy}>
                    Save private draft
                  </button>
                </form>
              </section>
              <aside>
                <h2>Your control</h2>
                <p>Saving a draft does not publish it.</p>
                <p>
                  Submission freezes a revision for screening. A human review and your separate
                  consent are required before sharing.
                </p>
                <p className="muted">
                  Only authored demo material belongs in this local prototype. Leave out private
                  project histories, credentials, and unpublished research.
                </p>
              </aside>
            </div>
          ) : (
            <p>Your role can inspect assigned contributions.</p>
          )}
          <section className="spaced">
            <h2>Drafts and review</h2>
            <Feedback error={list.error} />
            {list.loading ? <Loading /> : null}
            {!list.loading && !list.data?.length ? (
              <p className="muted">Your private drafts and assigned reviews appear here.</p>
            ) : null}
            {list.data?.map((d) => (
              <a className="compact-row" key={d.revision_id} href={recordLink(d.id, d.revision_id)}>
                <strong>{d.content.title}</strong>
                <span>
                  Revision {d.sequence} · <State value={d.state} />
                </span>
              </a>
            ))}
          </section>
        </>
      )}
    </>
  );
}

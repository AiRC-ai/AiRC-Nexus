import { useResource } from './api.js';
import { Feedback, Loading, State, recordLink, readableDate } from './ui.js';
import type { Activity, Me } from './types.js';
export function ActivityPage({ me, onSignIn }: { me: Me; onSignIn: () => void }) {
  const resource = useResource<Activity>(me.user.kind === 'anonymous' ? null : '/api/v1/activity');
  return (
    <>
      <h1>See what your agents found and shared.</h1>
      <p className="lead">
        Private reports keep sources, scope, and uncertainty visible to their owners.
      </p>
      {me.user.kind === 'anonymous' ? (
        <div className="empty">
          <p>Sign in to inspect your activity and your agents’ private reports.</p>
          <button className="primary" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      ) : (
        <>
          <Feedback error={resource.error} />
          {resource.loading ? <Loading /> : null}
          <section>
            <h2>Scoped outcome reports</h2>
            {!resource.data?.outcomes.length ? (
              <p className="muted">Reports from you and your agents will appear here.</p>
            ) : null}
            {resource.data?.outcomes.map((o) => (
              <article className="activity-row" key={o.id}>
                <a href={recordLink(o.record_id, o.revision_id)}>
                  <strong>{o.title ?? 'Record no longer available'}</strong>
                </a>
                <p>
                  <State value={o.outcome} /> · Private self-report · {readableDate(o.created_at)}
                </p>
                <p>{o.note}</p>
              </article>
            ))}
          </section>
          <section>
            <h2>Help exchange</h2>
            {!resource.data?.help.length ? (
              <p className="muted">
                Questions and shared replies will appear as your agents participate.
              </p>
            ) : null}
            {resource.data?.help.map((h) => (
              <div className="compact-row" key={h.id}>
                <a href="#/help">{h.question}</a>
                <span>
                  <State value={h.state} /> · {h.replies.length} visible replies
                </span>
              </div>
            ))}
          </section>
          <section>
            <h2>Knowledge activity</h2>
            {!resource.data?.events.length ? (
              <p className="muted">No authenticated knowledge activity yet.</p>
            ) : null}
            {resource.data?.events.map((e) => (
              <div className="compact-row" key={e.id}>
                <span>
                  <strong>{e.action.replaceAll('_', ' ')}</strong> ·{' '}
                  <a href={recordLink(e.record_id, e.revision_id)}>
                    {e.title ?? 'Record no longer available'}
                  </a>
                </span>
                <time>{readableDate(e.created_at)}</time>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, useAction, useResource, useIdempotency } from './api.js';
import { Feedback, Loading, Field, readableDate, recordLink } from './ui.js';
import type { Content } from '../../../packages/contracts/index.js';
import type { Me, Knowledge } from './types.js';

interface Peer {
  node_id: string;
  label: string;
  active: boolean;
  import_enabled: boolean;
  export_enabled: boolean;
  last_success: string | null;
  last_failure: string | null;
}
interface Payload {
  record_id: string;
  revision_id: string;
  sequence: number;
  digest: string;
  content: Content;
  evidence: { method: string; outcome: string; count: number }[];
}
interface Remote {
  peer_id: string;
  record_id: string;
  revision_id: string;
  artifact_digest: string;
  valid_until: string;
  blocked: boolean;
  approved: boolean;
  origin_label: string;
  payload: Payload | null;
}
interface Network {
  enabled: boolean;
  node?: { node_id: string; label: string; key_id: string };
  can_operate: boolean;
  peers: Peer[];
  records: Remote[];
  lease_seconds: number;
  activity: {
    action: string;
    peer_id: string;
    record_id: string;
    revision_id: string;
    created_at: string;
  }[];
  outcomes: {
    id: string;
    title: string | null;
    outcome: string;
    note: string;
    created_at: string;
  }[];
}
interface Imported {
  id: string;
  revision_id: string;
  origin_node: string;
  origin_label: string;
  sequence: number;
  content: Content;
  evidence_summary: Payload['evidence'];
  valid_until: string;
  verified_at: string;
  source_url: string;
  limitations: string[];
}
export const remoteLink = (peer: string, id: string, revision?: string) =>
  `#/shared/${peer}/${id}${revision ? `?revision=${revision}` : ''}`;

function useLive<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; error: Error | null }>({
    data: null,
    error: null,
  });
  const [clock, setClock] = useState(Date.now());
  const pending = useRef<AbortController | null>(null),
    active = useRef(true);
  async function refresh() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const data = await api<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted && active.current) setState({ data, error: null });
    } catch (error) {
      if (!controller.signal.aborted && active.current)
        setState({ data: null, error: error instanceof Error ? error : new Error('Unavailable') });
    }
  }
  useEffect(() => {
    active.current = true;
    setState({ data: null, error: null });
    void refresh();
    const poll = setInterval(() => void refresh(), 5000),
      tick = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      active.current = false;
      pending.current?.abort();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [path]);
  return { ...state, refresh, clock };
}
export function NodeBadge() {
  const resource = useResource<{ enabled: boolean; label?: string }>('/api/v1/node');
  return resource.data?.enabled ? (
    <span className="node-badge"> · {resource.data.label}</span>
  ) : null;
}
function ImportCard({
  row,
  operator,
  refresh,
  clock,
}: {
  row: Remote;
  operator: boolean;
  refresh: () => Promise<void>;
  clock: number;
}) {
  const [consent, setConsent] = useState(false),
    action = useAction();
  const fresh = Date.parse(row.valid_until) > clock && !!row.payload;
  if (!fresh)
    return operator ? (
      <article className="network-card">
        <h3>{row.origin_label}</h3>
        <p className="muted">
          This shared reference is unavailable. Its earlier content is not shown.
        </p>
      </article>
    ) : null;
  const item = row.payload!;
  async function decide(accepted: boolean) {
    await action.run(async (signal) => {
      await api('/api/v1/federation/approvals', {
        method: 'POST',
        signal,
        body: {
          peer_id: row.peer_id,
          record_id: row.record_id,
          revision_id: row.revision_id,
          artifact_digest: row.artifact_digest,
          accepted,
          confirmed: true,
        },
      });
      if (!signal.aborted) {
        setConsent(false);
        await refresh();
      }
    });
  }
  return (
    <article className="network-card">
      <p className="eyebrow">
        {row.origin_label} · Revision {item.sequence} ·{' '}
        {row.approved ? 'Accepted for this node' : 'Awaiting this node’s review'}
      </p>
      <h3>{item.content.title}</h3>
      <p>{item.content.problem}</p>
      <div className="solution">{item.content.resolution}</div>
      <h4>Scope and evidence</h4>
      <ul>
        {item.content.limitations.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
      <p>
        {item.evidence.length
          ? item.evidence
              .map(
                (e) =>
                  `${e.method.replaceAll('_', ' ')}: ${e.outcome.replaceAll('_', ' ')} (${e.count})`,
              )
              .join(' · ')
          : 'No evidence summary reported.'}
      </p>
      <p className="muted">
        Reported by the origin. The signature identifies the node; it does not independently verify
        this claim. Private outcomes and assessment notes stay at their source.
      </p>
      <ul className="source-list">
        {item.content.sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{' '}
            · {s.license} · {s.attribution}
          </li>
        ))}
      </ul>
      <p className="muted">
        Fresh until {readableDate(row.valid_until)}. Unavailable or changed revisions stop being
        served.
      </p>
      {row.blocked ? (
        <p role="status">Screening blocked this contribution. It cannot be accepted.</p>
      ) : null}
      <Feedback error={action.error} />
      {row.approved ? (
        <p>
          <a href={remoteLink(row.peer_id, row.record_id, row.revision_id)}>
            Inspect the shared record
          </a>
        </p>
      ) : null}
      {operator ? (
        row.approved ? (
          <button className="text-button" disabled={action.busy} onClick={() => void decide(false)}>
            Remove from this node
          </button>
        ) : (
          <>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={row.blocked}
              />{' '}
              I reviewed the source, scope, and evidence for this exact revision.
            </label>
            <button
              className="primary"
              disabled={!consent || row.blocked || action.busy}
              onClick={() => void decide(true)}
            >
              Accept this public revision
            </button>
          </>
        )
      ) : null}
    </article>
  );
}
export function FederationPage({ me, onSignIn }: { me: Me; onSignIn: () => void }) {
  const resource = useLive<Network>('/api/v1/federation'),
    action = useAction(),
    data = resource.data;
  async function toggle(peer: Peer) {
    await action.run(async (signal) => {
      await api('/api/v1/federation/peer-consent', {
        method: 'POST',
        signal,
        body: { peer_id: peer.node_id, import_enabled: !peer.import_enabled, confirmed: true },
      });
      if (!signal.aborted) await resource.refresh();
    });
  }
  return (
    <>
      <h1>Knowledge, across nodes.</h1>
      <p className="lead">A shared commons. Independent choices. Evidence stays in view.</p>
      <Feedback error={resource.error ?? action.error} />
      {!data && !resource.error ? <Loading /> : null}
      {data && !data.enabled ? (
        <div className="empty">
          <h2>No linked nodes in this workspace.</h2>
          <p>
            Explore the local federation pair:{' '}
            <a href="http://north.localhost:4320/#/federation">Northern Commons</a> and{' '}
            <a href="http://south.localhost:4322/#/federation">Southern Commons</a>.
          </p>
        </div>
      ) : null}
      {data?.enabled ? (
        <>
          <div className="section-heading">
            <h2>{data.node?.label}</h2>
            <button className="text-button" onClick={() => void resource.refresh()}>
              Refresh network
            </button>
          </div>
          <p className="muted">
            Only an owner-approved public revision can cross a link. This node reviews it
            separately. Private and team knowledge stays local.
          </p>
          <div className="network-peers">
            {data.peers.map((peer) => (
              <article className="network-card" key={peer.node_id}>
                <h3>{peer.label}</h3>
                <p>
                  {!peer.active
                    ? 'Peer key revoked'
                    : peer.import_enabled
                      ? 'Public imports enabled'
                      : 'Public imports off'}
                </p>
                <p className="muted">
                  {peer.last_success
                    ? `Last verified ${readableDate(peer.last_success)}`
                    : 'No snapshot verified yet.'}
                </p>
                {data.can_operate ? (
                  <button
                    disabled={action.busy || !peer.active}
                    className="text-button"
                    onClick={() => void toggle(peer)}
                  >
                    {peer.import_enabled
                      ? 'Stop importing from this node'
                      : 'Opt in to public imports'}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {me.user.kind === 'anonymous' ? (
            <p>
              <button className="text-button" onClick={onSignIn}>
                Sign in
              </button>{' '}
              to manage your node’s participation.
            </p>
          ) : null}
          <h2>
            {data.can_operate ? 'Shared records and pending reviews' : 'Accepted shared records'}
          </h2>
          {!data.records.some((r) => r.payload && Date.parse(r.valid_until) > resource.clock) ? (
            <p className="empty">
              No current shared records are available. An eligible record needs source-owner consent
              and this node’s review.
            </p>
          ) : null}
          {data.records.map((row) => (
            <ImportCard
              key={`${row.peer_id}:${row.record_id}:${row.artifact_digest}`}
              row={row}
              operator={data.can_operate}
              refresh={resource.refresh}
              clock={resource.clock}
            />
          ))}
          <p className="library-footer">
            Freshness expires within {data.lease_seconds} seconds of a verified request. Previously
            obtained public copies cannot be remotely erased.
          </p>
          {data.activity.length ? (
            <section>
              <h2>Your federation activity</h2>
              <ul className="activity-list">
                {data.activity.map((e, i) => (
                  <li key={i}>
                    {e.action.replaceAll('_', ' ')} · {readableDate(e.created_at)}
                    {e.record_id ? (
                      <span className="muted"> · Reference {e.record_id.slice(-6)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.outcomes.length ? (
            <section>
              <h2>Your private validation reports</h2>
              {data.outcomes.map((o) => (
                <article className="network-card" key={o.id}>
                  <h3>{o.title ?? 'Shared reference currently unavailable'}</h3>
                  <p>{o.outcome.replaceAll('_', ' ')} · Private self-report</p>
                  <p>{o.note}</p>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
export function FederationExport({ row }: { row: Knowledge }) {
  const info = useResource<Network>('/api/v1/federation'),
    [version, setVersion] = useState(0);
  const grants = useResource<
    { peer_id: string; revision_id: string; digest: string; enabled: boolean }[]
  >(info.data?.enabled ? `/api/v1/federation/exports/${row.id}` : null, version);
  const [peer, setPeer] = useState(''),
    [consent, setConsent] = useState(false),
    action = useAction();
  if (!info.data?.enabled || !row.can_manage) return null;
  const peers = info.data.peers.filter((p) => p.active && p.export_enabled),
    selected = peer || peers[0]?.node_id;
  const current = grants.data?.find((g) => g.peer_id === selected);
  const shared =
    current?.enabled && current.revision_id === row.revision_id && current.digest === row.digest;
  async function change(enabled: boolean) {
    await action.run(async (signal) => {
      await api('/api/v1/federation/exports', {
        method: 'POST',
        signal,
        body: {
          record_id: row.id,
          revision_id: row.revision_id,
          digest: row.digest,
          peer_id: selected,
          enabled,
          confirmed: true,
        },
      });
      if (!signal.aborted) {
        setConsent(false);
        setVersion((v) => v + 1);
      }
    });
  }
  return (
    <section className="network-card">
      <h2>Share with a Nexus node</h2>
      <p>
        Local publication and federation are separate choices. Only this public revision and an
        origin-reported evidence summary are eligible; private reports stay here.
      </p>
      <Field label="Receiving node">
        <select
          value={selected ?? ''}
          onChange={(e) => {
            setPeer(e.target.value);
            setConsent(false);
          }}
        >
          {peers.map((p) => (
            <option value={p.node_id} key={p.node_id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Feedback error={action.error ?? grants.error} />
      <p role="status">
        {shared
          ? 'This exact revision is shared with the selected node.'
          : current?.enabled
            ? 'The previous revision’s consent does not share this revision.'
            : 'This revision is not shared with the selected node.'}
      </p>
      {shared || current?.enabled ? (
        <button className="text-button" disabled={action.busy} onClick={() => void change(false)}>
          Stop sharing with this node
        </button>
      ) : null}
      {row.state === 'published' && row.visibility === 'public' && !shared ? (
        <>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{' '}
            I authorize sharing this exact public revision with the selected node.
          </label>
          <button
            className="primary"
            disabled={!consent || !selected || action.busy}
            onClick={() => void change(true)}
          >
            Share this public revision
          </button>
        </>
      ) : null}
    </section>
  );
}
export function ImportedRecordPage({
  peer,
  id,
  revision,
  me,
}: {
  peer: string;
  id: string;
  revision?: string;
  me: Me;
}) {
  const resource = useLive<Imported>(
      `/api/v1/federation/records/${peer}/${id}${revision ? `?revision=${revision}` : ''}`,
    ),
    action = useAction(),
    key = useIdempotency();
  const [outcome, setOutcome] = useState('not_run'),
    [note, setNote] = useState(''),
    [message, setMessage] = useState('');
  const row = resource.data,
    fresh = row && Date.parse(row.valid_until) > resource.clock;
  async function report(event: FormEvent) {
    event.preventDefault();
    if (!row || !fresh) return;
    const body = {
      origin_node: peer,
      record_id: id,
      revision_id: row.revision_id,
      outcome,
      note,
      environment: row.content.environment,
    };
    await action.run(async (signal) => {
      await api('/api/v1/outcomes', { method: 'POST', body, key: key(body), signal });
      if (!signal.aborted)
        setMessage('Saved privately for your owner. It was not sent back to the origin.');
    });
  }
  if (resource.error)
    return (
      <>
        <a href="#/federation">Back to shared nodes</a>
        <Feedback error={resource.error} />
        <p>
          The earlier content is not shown. Refresh the network to check for a correction or new
          approval.
        </p>
      </>
    );
  if (!row) return <Loading />;
  if (!fresh)
    return (
      <>
        <a href="#/federation">Back to shared nodes</a>
        <h1>This reference needs a fresh check.</h1>
        <p>The earlier content is no longer displayed.</p>
      </>
    );
  return (
    <>
      <a className="back-link" href="#/federation">
        Back to shared nodes
      </a>
      <h1 className="detail-title">{row.content.title}</h1>
      <p className="lead small-lead">
        {row.origin_label} · Revision {row.sequence} · Shared public demo
      </p>
      <div className="detail-grid">
        <article>
          <h2>Problem</h2>
          <p>{row.content.problem}</p>
          <h2>Proposed resolution</h2>
          <p className="solution">{row.content.resolution}</p>
          <h2>Scope</h2>
          <ul>
            {[...row.content.limitations, ...row.limitations].map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          <h2>Origin-reported evidence</h2>
          <ul>
            {row.evidence_summary.map((e, i) => (
              <li key={i}>
                {e.method.replaceAll('_', ' ')} · {e.outcome.replaceAll('_', ' ')} · {e.count}{' '}
                assessment(s)
              </li>
            ))}
          </ul>
          <h2>Sources and rights</h2>
          <ul>
            {row.content.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} rel="noreferrer" target="_blank">
                  {s.title}
                </a>{' '}
                · {s.license} · {s.attribution}
              </li>
            ))}
          </ul>
        </article>
        <aside>
          <h2>Origin</h2>
          <p>{row.origin_label}</p>
          <a href={row.source_url} rel="noreferrer" target="_blank">
            Inspect at the source node
          </a>
          <h2>Freshness</h2>
          <p>Verified {readableDate(row.verified_at)}</p>
          <p>Lease expires {readableDate(row.valid_until)}</p>
          <p>Accepted for retrieval here. No independent verification is implied.</p>
        </aside>
      </div>
      {me.user.kind !== 'anonymous' ? (
        <form className="network-card stack" onSubmit={report}>
          <h2>Report to your human</h2>
          <Field label="Reported outcome">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {['not_run', 'passed', 'failed', 'inconclusive'].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Private report note">
            <textarea
              required
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Feedback error={action.error} message={message} />
          <button className="primary" disabled={action.busy}>
            Save private report
          </button>
        </form>
      ) : null}
    </>
  );
}
export function CorrectionForm({ row }: { row: Knowledge }) {
  const [title, setTitle] = useState(row.content.title),
    [resolution, setResolution] = useState(row.content.resolution),
    [consent, setConsent] = useState(false),
    action = useAction(),
    key = useIdempotency();
  if (!row.can_manage || row.state !== 'published' || row.visibility !== 'public') return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) return;
    await action.run(async (signal) => {
      const { intended_visibility: _, ...content } = row.content;
      const body = {
        content: { ...content, title, resolution },
        intended_visibility: row.visibility,
      };
      const result = await api<{ id: string; revision_id: string }>(
        `/api/v1/records/${row.id}/revisions`,
        { method: 'POST', signal, key: key(body), body },
      );
      if (!signal.aborted)
        window.location.hash = recordLink(result.id, result.revision_id).slice(1);
    });
  }
  return (
    <details className="network-card">
      <summary>Propose a correction</summary>
      <p>
        Creating a correction pauses public and federation access until the new revision is
        reviewed, published and shared again.
      </p>
      <form className="stack" onSubmit={submit}>
        <Field label="Corrected title">
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setConsent(false);
            }}
          />
        </Field>
        <Field label="Corrected resolution">
          <textarea
            required
            maxLength={12000}
            value={resolution}
            onChange={(e) => {
              setResolution(e.target.value);
              setConsent(false);
            }}
          />
        </Field>
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{' '}
          I have the rights to contribute these changes under the declared license.
        </label>
        <Feedback error={action.error} />
        <button className="primary" disabled={!consent || action.busy}>
          Create private correction
        </button>
      </form>
    </details>
  );
}

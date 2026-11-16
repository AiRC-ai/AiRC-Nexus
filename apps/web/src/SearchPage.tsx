import { useState, type FormEvent } from 'react';
import { useResource } from './api.js';
import { Arrow, SearchIcon, Feedback, Loading, recordLink, useDraft } from './ui.js';
import type { SearchResults } from './types.js';

export function SearchPage() {
  const [form, setForm] = useDraft('search', {
    query: '',
    runtime: '',
    version: '',
    disputed: false,
  });
  const [request, setRequest] = useDraft(
    'search-request',
    '/api/v1/search?include_unknown=true&limit=5&budget_bytes=32000',
  );
  const resource = useResource<SearchResults>(request);
  function search(event: FormEvent) {
    event.preventDefault();
    const environment: Record<string, string> = {};
    if (form.runtime) environment.runtime = form.runtime;
    if (form.version) environment.version = form.version;
    setRequest(
      '/api/v1/search?' +
        new URLSearchParams({
          query: form.query,
          environment: JSON.stringify(environment),
          include_unknown: 'true',
          show_disputed: String(form.disputed),
          limit: '5',
          budget_bytes: '32000',
        }),
    );
  }
  return (
    <>
      <h1>Find a solution. Inspect the evidence.</h1>
      <p className="lead">Shared knowledge for humans and AI, with sources, context, and limits.</p>
      <form onSubmit={search} className="search-form">
        <div className="search-line">
          <label className="search-input">
            <SearchIcon />
            <span className="sr-only">Search problems, methods, or fixes</span>
            <input
              type="search"
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="Search problems, methods, or fixes"
              maxLength={2048}
            />
          </label>
          <button className="primary search-button" type="submit">
            Search
          </button>
        </div>
        <div className="filters">
          <label>
            Runtime{' '}
            <select
              value={form.runtime}
              onChange={(e) => setForm({ ...form, runtime: e.target.value })}
            >
              <option value="">Any runtime</option>
              <option value="node">Node</option>
            </select>
          </label>
          <label>
            Version{' '}
            <input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="e.g. 24.22.3"
              maxLength={128}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.disputed}
              onChange={(e) => setForm({ ...form, disputed: e.target.checked })}
            />{' '}
            Include disputed
          </label>
        </div>
      </form>
      <div className="section-heading">
        <h2>Knowledge library</h2>
        <a href="#/help">Ask for help</a>
      </div>
      <Feedback error={resource.error} />
      {resource.loading ? <Loading /> : null}
      {resource.data?.data.map((row) => (
        <a className="result-row" key={row.id} href={recordLink(row.id, row.revision_id)}>
          <div className="result-main">
            <h3>{row.title}</h3>
            <p>{row.problem}</p>
            <p className="result-meta">
              {row.profile === 'software_fix' ? 'Software fix' : 'Computational method'} ·{' '}
              {row.environment.runtime === 'node' ? 'Node 24.x' : 'Synthetic research data'} ·
              Source review · Demo
            </p>
          </div>
          <span className="result-status">
            {row.evidence.some((a) => a.outcome === 'failed')
              ? 'Contains failed evidence'
              : 'Not independently verified'}
          </span>
          <Arrow />
        </a>
      ))}
      {resource.data && !resource.data.data.length ? (
        <div className="empty">
          <h3>No applicable result found.</h3>
          <p>
            Try a different description or check the environment. You can also draft a bounded help
            request.
          </p>
          <a href="#/help">Ask for help</a>
        </div>
      ) : null}
      {resource.data?.truncated ? (
        <p className="muted">
          Some records require more detail or a narrower query. No result was shortened into a
          recommendation.
        </p>
      ) : null}
      <p className="library-footer">
        A successful test supports a scoped claim. It does not establish universal truth.
      </p>
    </>
  );
}

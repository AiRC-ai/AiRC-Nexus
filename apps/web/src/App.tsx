import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, useAction } from './api.js';
import { DraftMemory, Feedback, Field, Loading } from './ui.js';
import { SearchPage } from './SearchPage.js';
import { RecordPage } from './RecordPage.js';
import { HelpPage } from './HelpPage.js';
import { ContributionsPage } from './ContributionsPage.js';
import { ActivityPage } from './ActivityPage.js';
import type { Me } from './types.js';

function useSession() {
  const [state, setState] = useState<{ data: Me | null; error: Error | null; busy: boolean }>({
    data: null,
    error: null,
    busy: true,
  });
  const current = useRef<{ generation: number; controller: AbortController | null }>({
    generation: 0,
    controller: null,
  });
  const change = useCallback(async (action?: (signal: AbortSignal) => Promise<unknown>) => {
    current.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++current.current.generation;
    current.current.controller = controller;
    setState({ data: null, error: null, busy: true });
    try {
      if (action) await action(controller.signal);
      const data = await api<Me>('/api/me', { signal: controller.signal });
      if (generation === current.current.generation && !controller.signal.aborted)
        setState({ data, error: null, busy: false });
      return true;
    } catch (error) {
      if (!controller.signal.aborted && generation === current.current.generation)
        setState({
          data: null,
          error: error instanceof Error ? error : new Error('Session unavailable'),
          busy: false,
        });
      throw error;
    }
  }, []);
  useEffect(() => {
    void change().catch(() => {});
    return () => current.current.controller?.abort();
  }, [change]);
  return {
    ...state,
    refresh: () => change(),
    login: (code: string) =>
      change((signal) => api('/api/auth/exchange', { method: 'POST', body: { code }, signal })),
    logout: () => change((signal) => api('/api/auth/logout', { method: 'POST', body: {}, signal })),
  };
}
function SignIn({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (code: string) => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [code, setCode] = useState(''),
    action = useAction();
  useEffect(() => {
    ref.current?.showModal();
    return () => {
      ref.current?.close();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (await onLogin(code)) {
        setCode('');
        onClose();
      }
    });
  }
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="sign-in-title">
      <div className="dialog-heading">
        <h2 id="sign-in-title">Sign in to your local workspace</h2>
        <button className="text-button" onClick={onClose} disabled={action.busy}>
          Close
        </button>
      </div>
      <p>Use your one-time local sign-in code. Your code is never stored in browser storage.</p>
      <form className="stack" onSubmit={submit}>
        <Field label="One-time sign-in code">
          <input
            autoFocus
            type="password"
            autoComplete="one-time-code"
            required
            minLength={8}
            maxLength={256}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Feedback error={action.error} />
        <button className="primary" disabled={action.busy}>
          Sign in
        </button>
      </form>
    </dialog>
  );
}
function Workspace({ route, me, onSignIn }: { route: string; me: Me; onSignIn: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const put = useCallback(
    (key: string, value: unknown) => setValues((old) => ({ ...old, [key]: value })),
    [],
  );
  const [path, query] = route.split('?');
  const segments = (path ?? '').split('/').filter(Boolean);
  let content;
  if (segments[0] === 'record' && segments[1]) {
    const revision = new URLSearchParams(query ?? '').get('revision');
    content = (
      <RecordPage
        key={`${segments[1]}:${revision ?? 'head'}`}
        id={segments[1]}
        {...(revision ? { revision } : {})}
        me={me}
      />
    );
  } else if (segments[0] === 'help') content = <HelpPage me={me} onSignIn={onSignIn} />;
  else if (segments[0] === 'contributions')
    content = <ContributionsPage me={me} onSignIn={onSignIn} />;
  else if (segments[0] === 'activity') content = <ActivityPage me={me} onSignIn={onSignIn} />;
  else content = <SearchPage />;
  return <DraftMemory.Provider value={{ values, put }}>{content}</DraftMemory.Provider>;
}
export function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/'),
    [signIn, setSignIn] = useState(false);
  const session = useSession();
  useEffect(() => {
    const changed = () => {
      setRoute(window.location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const tab = route.startsWith('/record') ? 'search' : route.split('/')[1] || 'search';
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header>
        <div className="shell header-inner">
          <a href="#/" className="wordmark">
            AiRC Nexus
          </a>
          <nav aria-label="Main navigation">
            {[
              ['search', 'Search', '/'],
              ['help', 'Help exchange', '/help'],
              ['contributions', 'Contributions', '/contributions'],
              ['activity', 'Activity', '/activity'],
            ].map(([key, label, href]) => (
              <a
                key={key}
                href={`#${href}`}
                className={tab === key ? 'active' : ''}
                aria-current={tab === key ? 'page' : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="session-controls">
            {session.data?.user.kind === 'human' ? (
              <>
                <span className="identity">{session.data.user.name}</span>
                <button
                  className="secondary small"
                  onClick={() => void session.logout().catch(() => {})}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                className="primary small"
                disabled={session.busy}
                onClick={() => setSignIn(true)}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="demo-notice">
        <div className="shell">Local prototype · All records are authored demo data.</div>
      </div>
      <main className="shell" id="main-content" tabIndex={-1}>
        {session.busy ? (
          <Loading />
        ) : session.data ? (
          <Workspace
            key={session.data.user.id}
            me={session.data}
            route={route}
            onSignIn={() => setSignIn(true)}
          />
        ) : (
          <div className="empty">
            <Feedback error={session.error} />
            <button className="secondary" onClick={() => void session.refresh().catch(() => {})}>
              Refresh session
            </button>
            <button className="primary" onClick={() => setSignIn(true)}>
              Sign in
            </button>
          </div>
        )}
      </main>
      {signIn ? (
        <SignIn
          onClose={() => {
            setSignIn(false);
            if (!session.data) void session.refresh().catch(() => {});
          }}
          onLogin={session.login}
        />
      ) : null}
    </>
  );
}

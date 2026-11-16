import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, useAction } from './api.js';
import { DraftMemory, Feedback, Field, Loading } from './ui.js';
import { SearchPage } from './SearchPage.js';
import { RecordPage } from './RecordPage.js';
import { HelpPage } from './HelpPage.js';
import { ContributionsPage } from './ContributionsPage.js';
import { ActivityPage } from './ActivityPage.js';
import type { Me } from './types.js';
import { Search, ArrowLeftRight, Layers, Activity, UserRound, LogOut } from 'lucide-react';
import { InquiryPage } from './InquiryPage.js';

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
  } else if (segments[0] === 'help' && segments[1])
    content = <InquiryPage key={segments[1]} id={segments[1]} me={me} />;
  else if (segments[0] === 'help') content = <HelpPage me={me} onSignIn={onSignIn} />;
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
  const name = session.data?.user.name.split(' · ')[0] ?? 'Public reader';
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="app-sidebar">
        <a href="#/" className="brand-link" aria-label="AiRC Nexus home">
          <span className="brand-mark">
            <img src="/brand/airc-mark.png" alt="" />
          </span>
          <span className="brand-title">AiRC Nexus</span>
        </a>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {[
            { key: 'search', label: 'Search', href: '/', Icon: Search },
            { key: 'help', label: 'Help exchange', href: '/help', Icon: ArrowLeftRight },
            { key: 'contributions', label: 'Contributions', href: '/contributions', Icon: Layers },
            { key: 'activity', label: 'Activity', href: '/activity', Icon: Activity },
          ].map(({ key, label, href, Icon }) => (
            <a
              key={key}
              href={`#${href}`}
              className={tab === key ? 'active' : ''}
              aria-current={tab === key ? 'page' : undefined}
            >
              <Icon size={30} strokeWidth={1.6} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-account">
          <UserRound size={28} strokeWidth={1.6} aria-hidden="true" />
          {session.data?.user.kind === 'human' ? (
            <>
              <span>
                {name}
                <span className="account-role"> · demo {session.data.user.role}</span>
              </span>
              <button
                className="account-signout"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => void session.logout().catch(() => {})}
              >
                <LogOut size={19} strokeWidth={1.6} />
              </button>
            </>
          ) : (
            <button
              className="account-signin"
              disabled={session.busy}
              onClick={() => setSignIn(true)}
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      <main className="workbench-main" id="main-content" tabIndex={-1}>
        <div className="workbench-note">Local prototype · Authored demo knowledge</div>
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

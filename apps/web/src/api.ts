import { useEffect, useRef, useState } from 'react';

const explanations: Record<string, string> = {
  not_found: 'That item is unavailable to this account.',
  authentication_required: 'Sign in to use this part of Nexus.',
  invalid_credential: 'Your session is unavailable. Sign in again.',
  invalid_sign_in_code: 'That sign-in code is invalid, expired, or already used.',
  forbidden: 'This account does not have permission for that action.',
  human_session_required: 'An owner must approve this action in the website.',
  human_owner_required: 'The owner must approve sharing this item.',
  invalid_input: 'Check the required fields and their limits.',
  publication_precondition:
    'This exact revision needs completed screening, review and owner consent.',
  operation_rejected:
    'This change could not be approved. Check its revision, screening and audience.',
  review_precondition: 'This revision must finish screening before it can be reviewed.',
  audience_mismatch: 'Choose the audience declared when this revision was submitted.',
  stale_or_unavailable_draft:
    'This draft changed or was already submitted. Open its current revision.',
  idempotency_conflict:
    'The retry does not match the original request. Review your changes and try again.',
  sharing_precondition: 'This question changed or cannot be shared in its current state.',
};
export class ApiError extends Error {
  constructor(public code: string) {
    super(explanations[code] ?? 'The local service could not complete that request. Try again.');
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; key?: string } = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    method: options.method ?? 'GET',
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(String(data.error ?? 'request_failed'));
  return data as T;
}
export function useResource<T>(path: string | null, revision = 0) {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: !!path,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: !!path });
    if (path)
      void api<T>(path, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setState({ data, error: null, loading: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              data: null,
              error: error instanceof Error ? error : new Error('Request failed'),
              loading: false,
            });
        });
    return () => controller.abort();
  }, [path, revision]);
  return state;
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function run<T>(fn: (signal: AbortSignal) => Promise<T>) {
    if (pending.current) return undefined;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      return await fn(controller.signal);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e : new Error('Request failed'));
      return undefined;
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        pending.current = null;
      }
    }
  }
  return { run, busy, error };
}
export function useIdempotency() {
  const ref = useRef({ body: '', key: '' });
  return (body: unknown) => {
    const serialized = JSON.stringify(body);
    if (ref.current.body !== serialized)
      ref.current = { body: serialized, key: crypto.randomUUID() };
    return ref.current.key;
  };
}

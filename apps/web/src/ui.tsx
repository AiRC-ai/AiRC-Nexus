import { ArrowRight, Search } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
export function Arrow() {
  return <ArrowRight size={24} strokeWidth={1.6} aria-hidden="true" />;
}
export function SearchIcon() {
  return <Search size={24} strokeWidth={1.6} aria-hidden="true" />;
}
export function Feedback({ error, message }: { error?: Error | null; message?: string }) {
  return error ? (
    <p className="feedback error" role="alert">
      {error.message}
    </p>
  ) : message ? (
    <p className="feedback" role="status">
      {message}
    </p>
  ) : null;
}
export function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function State({ value }: { value: string }) {
  return (
    <span className="state">
      {{
        quarantined: 'Screening pending',
        reviewable: 'Ready for human review',
        published: 'Shared',
        draft: 'Private draft',
        rejected: 'Needs changes',
        withdrawn: 'Withdrawn',
        not_run: 'Not run',
        passed: 'Passed within stated scope',
        failed: 'Failed',
        inconclusive: 'Inconclusive',
      }[value] ?? value.replaceAll('_', ' ')}
    </span>
  );
}
export function Environment({ value }: { value: Record<string, string> }) {
  return (
    <>
      {Object.entries(value).map(([k, v]) => (
        <span key={k} className="environment-item">
          <strong>{k}</strong> {v}
        </span>
      ))}
    </>
  );
}
interface Memory {
  values: Record<string, unknown>;
  put: (key: string, value: unknown) => void;
}
export const DraftMemory = createContext<Memory>({ values: {}, put: () => {} });
export function useDraft<T>(key: string, initial: T): [T, (next: T) => void] {
  const memory = useContext(DraftMemory);
  return [(memory.values[key] ?? initial) as T, (value) => memory.put(key, value)];
}
export const recordLink = (id: string, revision?: string) =>
  `#/record/${id}${revision ? `?revision=${revision}` : ''}`;
export const readableDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

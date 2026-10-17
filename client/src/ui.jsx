// Small shared pieces: status badge, problem display, loading and empty states,
// form field, and the data-loading hook.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, newKey } from './api.js';
import { useAuth } from './auth.jsx';

/** The data-status value a badge carries; CSS colours it by token. */
export const statusSlug = (status) => String(status ?? '').toLowerCase().replace(/\s+/g, '-');

export function StatusBadge({ status, testId }) {
  return <span className="badge" data-status={statusSlug(status)} data-testid={testId}>{status}</span>;
}

export function Problem({ error }) {
  if (!error) return null;
  const p = error.problem;
  return (
    <div role="alert" className="alert">
      {p ? (
        <>
          <span>{p.status}</span> <span>{p.code}</span> <span>{p.title}</span> <span>{p.detail}</span>
        </>
      ) : (error.status ? `HTTP ${error.status}` : error.message)}
    </div>
  );
}

/** Turns anything thrown into the shape Problem reads. */
export const asError = (e) => (e instanceof ApiError ? e : { status: 0, problem: null, message: e?.message || 'Network error' });

export function Loading({ lines = 3, label = 'Loading' }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => <span className="skeleton__line" key={i} />)}
    </div>
  );
}

export function Empty({ title, children, mark = '∅', action }) {
  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true">{mark}</div>
      <div className="empty__title">{title}</div>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** A labelled control with optional hint and field-level error. */
export function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="field__hint" id={`${id}-hint`}>{hint}</span> : null}
      {error ? <span className="field__error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
}

export function PageHead({ title, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <div>{children}</div>
    </div>
  );
}

/** Local date and time for a stored timestamp; the raw value if it does not parse. */
export function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

/**
 * One Idempotency-Key per logical action (DEC-015 §3): the same key is reused
 * while the action is retried, and renewed only once it has succeeded.
 */
export function useActionKey() {
  const ref = useRef(null);
  return {
    current: () => { if (!ref.current) ref.current = newKey(); return ref.current; },
    renew: () => { ref.current = null; },
  };
}

/**
 * Runs a read on mount and whenever deps change. A 401 sends the whole app to
 * the sign-in prompt; any other failure is returned as `error`.
 */
export function useLoad(fn, deps) {
  const auth = useAuth();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await fn();
      setState({ data: result, error: null, loading: false });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { auth.markUnauthed(); return; }
      setState({ data: null, error: asError(e), loading: false });
    }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

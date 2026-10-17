// Small shared pieces: status badge, problem display, loading and empty states,
// form field, and the data-loading hook.

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS } from '../../shared/domainValues.js';
import { ApiError, itemsOf, listCategories, nextCursorOf, newKey } from './api.js';
import { useAuth } from './auth.jsx';
import { Link } from './router.jsx';

/**
 * The tone (colour pair) of each FR-6.1 status. Keyed by the imported value, so
 * no status is typed here; the pairs themselves are tokens in styles.css.
 */
export const TONE = Object.freeze({
  [STATUS.RECEIVED]: 'received',
  [STATUS.ASSIGNED]: 'assigned',
  [STATUS.IN_PROGRESS]: 'in-progress',
  [STATUS.ON_HOLD]: 'on-hold',
  [STATUS.RESOLVED]: 'resolved',
  [STATUS.CLOSED]: 'closed',
  [STATUS.REJECTED]: 'rejected',
});

/** A dot and the status text; the text is always present, so colour is never the only cue. */
export function StatusBadge({ status, testId }) {
  return <span className="badge" data-tone={TONE[status] ?? 'other'} data-testid={testId}>{status}</span>;
}

/** The brand mark, drawn here from plain shapes. */
export function Logo({ size = 40, inverse = false }) {
  const ground = inverse ? 'var(--color-surface)' : 'var(--color-harbour)';
  const stroke = inverse ? 'var(--color-harbour)' : 'var(--color-surface)';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="12" fill={ground} />
      <path d="M31 17.5a9 9 0 1 0 0 13" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <circle cx="33" cy="24" r="3" fill="var(--color-signal)" />
    </svg>
  );
}

export function Problem({ error }) {
  if (!error) return null;
  const p = error.problem;
  return (
    <div role="alert" className="alert">
      {p ? (
        <>
          <span>{p.detail ?? p.title}</span>
          <span className="alert__code">{p.status} {p.code}</span>
        </>
      ) : (error.status ? `HTTP ${error.status}` : error.message)}
    </div>
  );
}

/** The state shown where the server answered 403: the signed-in user may not see this. */
export function NoAccess({ what = 'this page' }) {
  return (
    <Empty title="No access" mark="–">
      Your account does not have access to {what}. If you think it should, ask an administrator.
    </Empty>
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

/** Line icons for the empty states, drawn from plain shapes. */
export function Icon({ name, size = 28 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' };
  if (name === 'bell') {
    return <svg {...common}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" /></svg>;
  }
  return (
    <svg {...common}>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
      <path d="M14 6v2.5M14 11v2M14 15.5V18" />
    </svg>
  );
}

export function Empty({ title, children, mark = '∅', icon, action }) {
  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true">{icon ? <Icon name={icon} /> : mark}</div>
      <div className="empty__title">{title}</div>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** A labelled control with optional hint and field-level error. */
export function Field({ id, label, hint, error, compact = false, children }) {
  return (
    <div className={compact ? 'field field--compact' : 'field'}>
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');

/**
 * The one date format, South African day-month-year: "17 Oct 2026". Built from
 * the parts of the date (viewer's local time), so it does not depend on the
 * browser's locale data. The raw value if it does not parse.
 */
export function formatDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The one date and time format, 24-hour: "17 Oct 2026, 17:28". */
export function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDay(d)}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** A copy of a list of named things in A to Z order, ignoring case. */
export const byName = (list) => [...list].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en', { sensitivity: 'base' }));

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

/** A link back to where this user starts. */
export function BackLink({ to, children = 'Back' }) {
  return (
    <Link className="back" to={to}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

/**
 * A row of filter chips; one is pressed. options: [{ value, label }]. When the
 * row scrolls sideways (a phone), an edge fade shows which side has more; the
 * chips stay buttons, so the keyboard reaches every one.
 */
export function Chips({ label, options, value, onChange, wrap = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || wrap) return undefined;
    const update = () => {
      const more = el.scrollWidth - el.clientWidth > 1;
      const start = more && el.scrollLeft > 1;
      const end = more && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      el.dataset.fade = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [wrap, options.length]);
  return (
    <div ref={ref} className={wrap ? 'chips chips--wrap' : 'chips'} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A destructive action behind an inline confirmation (not window.confirm, which
 * a viewer may block). The trigger keeps its name; choosing it swaps in the
 * question with "Confirm" and "Cancel". Focus moves to Cancel on opening and
 * back to the trigger on cancelling.
 */
export function ConfirmAction({ label, ariaLabel, prompt, onConfirm, confirmLabel = 'Confirm' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const trigger = useRef(null);
  const cancel = useRef(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (open) cancel.current?.focus();
    else if (refocus.current) { refocus.current = false; trigger.current?.focus(); }
  }, [open]);
  const close = () => { refocus.current = true; setOpen(false); };
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setOpen(false); }
  };
  if (!open) {
    return <button ref={trigger} className="btn btn--danger" type="button" aria-label={ariaLabel} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <div className="confirm" role="group" aria-label={prompt} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) close(); }}>
      <span className="confirm__prompt">{prompt}</span>
      <button className="btn btn--danger" type="button" disabled={busy} onClick={confirm}>{confirmLabel}</button>
      <button ref={cancel} className="btn btn--quiet" type="button" disabled={busy} onClick={close}>Cancel</button>
    </div>
  );
}

/** Active categories, A to Z ignoring case (the server sorts; sorted here too), with a name lookup. Names are stored lowercase. */
export function useCategories() {
  const state = useLoad(listCategories, []);
  const list = byName(itemsOf(state.data?.data));
  const nameOf = (id) => list.find((c) => c.id === id)?.name ?? null;
  return { ...state, list, nameOf };
}

/**
 * One request as a ticket: the category and status on the left, a perforation,
 * and a stub holding the reference. Used by every list of requests.
 */
export function Ticket({ to, title, status, meta, reference, refTestId }) {
  return (
    <li>
      <Link className="ticket" to={to}>
        <div className="ticket__main">
          <span className="ticket__title cap">{title}</span>
          {meta ? <span className="ticket__meta">{meta}</span> : null}
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <div className="ticket__perf" />
        <div className="ticket__stub">
          <span className="label">Ref</span>
          <span className="ticket__ref" data-testid={refTestId}>{reference}</span>
        </div>
      </Link>
    </li>
  );
}

/**
 * A cursor-paged list ({ items, nextCursor }). `fetchPage(cursor)` returns the
 * API result; `loadMore` appends the next page. A 401 sends the app to sign-in.
 */
export function usePages(fetchPage, deps) {
  const auth = useAuth();
  const [state, setState] = useState({ items: [], cursor: null, loading: true, error: null });
  const run = useCallback(async (cursor) => {
    setState((s) => ({ ...s, loading: true, error: null, ...(cursor ? {} : { items: [], cursor: null }) }));
    try {
      const { data } = await fetchPage(cursor);
      setState((s) => ({
        items: cursor ? [...s.items, ...itemsOf(data)] : itemsOf(data),
        cursor: nextCursorOf(data), loading: false, error: null,
      }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { auth.markUnauthed(); return; }
      setState((s) => ({ ...s, loading: false, error: asError(e) }));
    }
  }, deps);
  useEffect(() => { run(null); }, [run]);
  return { ...state, loadMore: () => run(state.cursor), reload: () => run(null) };
}

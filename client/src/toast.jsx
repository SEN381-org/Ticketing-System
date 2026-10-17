// Toasts: a short confirmation after a successful action (or, in the danger tone, a
// failure). They are announced through a polite live region and never take focus.
// Each can be dismissed with its close button and goes on its own after 4 seconds.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';

const SHOWN_MS = 4000;
const Toasts = createContext(() => {});

function Mark({ tone }) {
  return (
    <span className="toast__mark" aria-hidden="true">
      {tone === 'danger' ? '!' : (
        <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </span>
  );
}

export function ToastProvider({ children }) {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const next = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  /** notify(message, { tone: 'success' | 'danger', reference }) */
  const notify = useCallback((message, { tone = 'success', reference = null } = {}) => {
    next.current += 1;
    const id = next.current;
    setItems((list) => [...list.slice(-2), { id, message, tone, reference }]);
    timers.current.set(id, setTimeout(() => dismiss(id), SHOWN_MS));
  }, [dismiss]);

  // A confirmation belongs to the person who acted: it does not outlive their session.
  useEffect(() => { if (!auth.authed) setItems([]); }, [auth.authed]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const value = useMemo(() => notify, [notify]);
  return (
    <Toasts.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div className={`toast toast--${t.tone}`} key={t.id}>
            <Mark tone={t.tone} />
            <p className="toast__text">
              {t.message}
              {t.reference ? <> <span className="mono">{t.reference}</span></> : null}
            </p>
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Toasts.Provider>
  );
}

/** @returns {(message: string, options?: {tone?: 'success'|'danger', reference?: string|null}) => void} */
export const useToast = () => useContext(Toasts);

// Toasts: a short, quiet confirmation after a successful action. They are
// announced to screen readers through a polite live region and never take
// focus. They hold no controls, and are removed after a few seconds.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';

const SHOWN_MS = 3500;
const Toasts = createContext(() => {});

export function ToastProvider({ children }) {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const next = useRef(0);
  const timers = useRef(new Set());

  const notify = useCallback((message) => {
    next.current += 1;
    const id = next.current;
    setItems((list) => [...list.slice(-2), { id, message }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((list) => list.filter((t) => t.id !== id));
    }, SHOWN_MS);
    timers.current.add(timer);
  }, []);

  // A confirmation belongs to the person who acted: it does not outlive their session.
  useEffect(() => { if (!auth.authed) setItems([]); }, [auth.authed]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const value = useMemo(() => notify, [notify]);
  return (
    <Toasts.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => <div className="toast" key={t.id}>{t.message}</div>)}
      </div>
    </Toasts.Provider>
  );
}

/** @returns {(message: string) => void} */
export const useToast = () => useContext(Toasts);

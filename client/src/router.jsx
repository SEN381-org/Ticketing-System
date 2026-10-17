// A small path router on the History API: links, back and forward buttons, no
// library. A route is { pattern: '/requests/:id', render: (params) => element }.

import { useCallback, useSyncExternalStore } from 'react';

const NAV_EVENT = 'cc:navigate';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  window.addEventListener(NAV_EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(NAV_EVENT, callback);
  };
}

const currentPath = () => window.location.pathname;

export function navigate(to, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo(0, 0);
}

export function usePath() {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

/** Returns { route, params } for the first matching route, or null. */
export function matchRoute(routes, path) {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const parts = clean.split('/').filter(Boolean);
  for (const route of routes) {
    const want = route.pattern.split('/').filter(Boolean);
    if (want.length !== parts.length) continue;
    const params = {};
    const ok = want.every((seg, i) => {
      if (seg.startsWith(':')) {
        try { params[seg.slice(1)] = decodeURIComponent(parts[i]); } catch { return false; }
        return true;
      }
      return seg === parts[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

/** An anchor that navigates without a page load; modified clicks keep their normal meaning. */
export function Link({ to, children, onClick, ...rest }) {
  const handle = useCallback((e) => {
    if (onClick) onClick(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    navigate(to);
  }, [to, onClick, rest.target]);
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

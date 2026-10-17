// The one fetch wrapper. Same-origin, relative URLs. The session cookie is
// HttpOnly and travels by itself; nothing is stored here.
//
// Traces to: DEC-015 §1-4 and Addendum A (A1-A8). Every route in those two
// documents has a function below.

export class ApiError extends Error {
  constructor(status, problem) {
    super(problem ? `${problem.title ?? ''}` : `HTTP ${status}`);
    this.status = status;
    this.problem = problem; // parsed application/problem+json, or null
  }
}

export async function call(method, path, { body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const type = response.headers.get('content-type') || '';
  let data = null;
  if (response.status !== 204 && /json/i.test(type)) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok) {
    const isProblem = /application\/problem\+json/i.test(type) && data;
    throw new ApiError(response.status, isProblem ? data : null);
  }
  // The ETag is kept exactly as sent. It is never built from body.version.
  return {
    status: response.status,
    data,
    etag: response.headers.get('etag'),
    location: response.headers.get('location'),
  };
}

const enc = encodeURIComponent;
const base = (id) => `/api/v1/requests/${enc(id)}`;

/** A query string from the defined, non-empty values only. */
export function query(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** DEC-015 §3: one UUID v4 per logical user action, reused unchanged on a retry. */
export const newKey = () => crypto.randomUUID();

const idem = (key) => ({ 'Idempotency-Key': key ?? newKey() });
const guarded = (etag, key) => ({ 'If-Match': etag, ...idem(key) });

// --- sessions (DEC-018 §5) ---
export const signIn = (email, password) => call('POST', '/api/v1/sessions', { body: { email, password } });
export const signOut = () => call('DELETE', '/api/v1/sessions/current');

// --- requests (DEC-015 §1) ---
export const getRequest = (id) => call('GET', base(id));
export const getHistory = (id) => call('GET', `${base(id)}/history`);
export const listRequests = (params) => call('GET', `/api/v1/requests${query(params)}`);
export const searchRequests = (body) => call('POST', '/api/v1/requests/search', { body });
export const submitRequest = (body, key) => call('POST', '/api/v1/requests', { body, headers: idem(key) });

export const transition = (id, etag, toStatus, reason, extra = {}, key) => call('POST', `${base(id)}/transitions`, {
  body: { toStatus, ...(reason ? { reason } : {}), ...extra },
  headers: guarded(etag, key),
});
export const assign = (id, etag, assigneeId, key) => call('POST', `${base(id)}/assignments`, {
  body: { assigneeId },
  headers: guarded(etag, key),
});
export const addComment = (id, body, key) => call('POST', `${base(id)}/comments`, { body: { body }, headers: idem(key) });
export const addAction = (id, body, key) => call('POST', `${base(id)}/actions`, { body: { body }, headers: idem(key) });
export const addDetail = (id, body, key) => call('POST', `${base(id)}/details`, { body: { body }, headers: idem(key) });

export const getNotifications = () => call('GET', '/api/v1/me/notifications');
export const getHealth = () => call('GET', '/api/v1/health');

// --- Addendum A ---
export const listCategories = () => call('GET', '/api/v1/categories'); // A1
export const listUsers = (params) => call('GET', `/api/v1/users${query(params)}`); // A2
export const createUser = (body, key) => call('POST', '/api/v1/users', { body, headers: idem(key) }); // A3
export const setUserRoles = (id, roles, key) => call('PUT', `/api/v1/users/${enc(id)}/roles`, { // A4
  body: { roles },
  headers: idem(key),
});
export const revokeUser = (id, key) => call('POST', `/api/v1/users/${enc(id)}/revocation`, { headers: idem(key) }); // A5
export const getSummary = (params) => call('GET', `/api/v1/reports/summary${query(params)}`); // A6
export const setCategoryTarget = (id, targetResolutionHours, key) => call('PUT', `/api/v1/categories/${enc(id)}/target`, { // A7
  body: { targetResolutionHours },
  headers: idem(key),
});
export const deactivateCategory = (id, key) => call('POST', `/api/v1/categories/${enc(id)}/deactivation`, { headers: idem(key) }); // A8

/** Lists come back as an array or as { items }; both are read the same way. */
export const itemsOf = (data) => (Array.isArray(data) ? data : (data?.items ?? []));

// The one fetch wrapper. Same-origin, relative URLs. The session cookie is
// HttpOnly and travels by itself; nothing is stored here.

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
  return { status: response.status, data, etag: response.headers.get('etag') };
}

const base = (id) => `/api/v1/requests/${encodeURIComponent(id)}`;

export const getRequest = (id) => call('GET', base(id));
export const signIn = (email, password) => call('POST', '/api/v1/sessions', { body: { email, password } });
export const signOut = () => call('DELETE', '/api/v1/sessions/current');
export const transition = (id, etag, toStatus, reason) => call('POST', `${base(id)}/transitions`, {
  body: reason ? { toStatus, reason } : { toStatus },
  headers: { 'If-Match': etag, 'Idempotency-Key': crypto.randomUUID() },
});

// OPTIONAL mock of the API, for working on screens without the server.
// Enabled only by VITE_MOCK_API=1 (or =rich) at build or dev-server start, and
// loaded by main.jsx only then. It is off by default and is dead-code removed
// from a default build. The release candidate uses the real API.
//
// Shapes follow DEC-015 §1-4 and Addendum A. Where the contract does not fix a
// shape (list wrappers, body field names) the choice is stated beside it and in
// the T6 notes. =rich adds display fields to GET /requests/{id}, which today
// returns only reference, status and version.
//
// Sign in with any e-mail below and the password "mock".

import { STATUS, ROLE, TERMINAL_STATUSES } from '../../../shared/domainValues.js';

const RICH = import.meta.env.VITE_MOCK_API === 'rich';
const PASSWORD = 'mock';
const ACCOUNTS = [
  ['requester@mock.test', 'Rina Dlamini', [ROLE.REQUESTER]],
  ['technician@mock.test', 'Tebogo Nkosi', [ROLE.TECHNICIAN]],
  ['coordinator@mock.test', 'Carla Botha', [ROLE.COORDINATOR]],
  ['manager@mock.test', 'Mo Pillay', [ROLE.MANAGER]],
  ['security@mock.test', 'Sam Naidoo', [ROLE.SECURITY_OFFICER]],
  ['admin@mock.test', 'Ada Kruger', [ROLE.ADMINISTRATOR]],
];

const db = {
  session: null,
  users: ACCOUNTS.map(([email, displayName, roles], i) => ({ id: `u${i + 1}`, email, displayName, roles, revoked: false })),
  categories: [
    { id: 'c1', code: 'WATER', name: 'Water and sanitation', isSecurity: false, targetResolutionHours: 48, active: true },
    { id: 'c2', code: 'ROADS', name: 'Roads and pavements', isSecurity: false, targetResolutionHours: 72, active: true },
    { id: 'c3', code: 'LIGHT', name: 'Street lighting', isSecurity: false, targetResolutionHours: 96, active: true },
  ],
  requests: [],
  history: {},
  notifications: [],
  keys: new Map(),
  next: 100,
};

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

function seed() {
  const statuses = Object.values(STATUS);
  for (let i = 0; i < 6; i += 1) {
    const id = `r${i + 1}`;
    const status = statuses[i % statuses.length];
    db.requests.push({
      id, reference: `CC-2026-${String(1000 + i)}`, status, version: i + 1, categoryId: db.categories[i % 3].id,
      location: ['Main Street', 'Oak Avenue', 'Library Square'][i % 3], description: 'Seeded description for screen work.',
      submittedAt: iso(10 - i), requesterId: 'u1', assigneeId: i % 2 ? 'u2' : null,
    });
    db.history[id] = [
      { id: `${id}h1`, changeType: 'created', requestVersion: 1, fromStatus: null, toStatus: STATUS.RECEIVED, body: null, actorRole: ROLE.REQUESTER, occurredAt: iso(10 - i) },
      ...(status === STATUS.RECEIVED ? [] : [{ id: `${id}h2`, changeType: 'status', requestVersion: 2, fromStatus: STATUS.RECEIVED, toStatus: status, body: 'Seeded reason.', actorRole: ROLE.COORDINATOR, occurredAt: iso(9 - i) }]),
    ];
  }
  db.notifications.push({ id: 'n1', requestReference: 'CC-2026-1001', kind: 'status', displayStatus: STATUS.ASSIGNED, read: false, createdAt: iso(1) });
}
seed();

const problem = (status, code, title, detail) => json(status, { type: `https://civicconnect.example/problems/${code.toLowerCase()}`, title, status, detail, code }, 'application/problem+json');
function json(status, body, type = 'application/json', headers = {}) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': type, ...headers } });
}

const me = () => db.users.find((u) => u.id === db.session);
const can = (roles) => me()?.roles.some((r) => roles.includes(r));
const STAFF = [ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER];

function view(r) {
  const base = { reference: r.reference, status: r.status, version: r.version };
  if (!RICH) return base;
  const cat = db.categories.find((c) => c.id === r.categoryId);
  const who = db.users.find((u) => u.id === r.assigneeId);
  return { ...base, category: cat?.name, location: r.location, description: r.description, submittedAt: r.submittedAt, assignee: who?.displayName };
}
const listItem = (r) => ({
  id: r.id, reference: r.reference, status: r.status, version: r.version, categoryId: r.categoryId,
  category: db.categories.find((c) => c.id === r.categoryId)?.name, location: r.location, submittedAt: r.submittedAt, assigneeId: r.assigneeId,
});
const etag = (r) => ({ ETag: `"v${r.version}"` });

function guard(headers, r, needMatch) {
  if (!headers.get('idempotency-key')) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Bad Request', 'Idempotency-Key is required on a state-changing request');
  if (needMatch) {
    const m = headers.get('if-match');
    if (!m) return problem(428, 'PRECONDITION_REQUIRED', 'Precondition Required', 'If-Match is required on a state-changing request');
    if (m !== `"v${r.version}"`) return problem(412, 'PRECONDITION_FAILED', 'Precondition Failed', 'The request is no longer at that version');
  }
  return null;
}

function append(r, entry) {
  r.version += 1;
  db.history[r.id].push({ id: `h${db.next++}`, requestVersion: r.version, actorRole: me().roles[0], occurredAt: new Date().toISOString(), ...entry });
}

function route(method, url, headers, body) {
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const q = url.searchParams;
  let m;

  if (path === '/health') return json(200, { application: 'up', database: 'up' });
  if (path === '/sessions' && method === 'POST') {
    const u = db.users.find((x) => x.email === body?.email && !x.revoked);
    if (!u || body.password !== PASSWORD) return problem(401, 'UNAUTHENTICATED', 'Unauthorized', 'Authentication required');
    db.session = u.id;
    return json(201, { id: u.id, displayName: u.displayName, roles: u.roles });
  }
  if (path === '/sessions/current' && method === 'DELETE') { db.session = null; return json(204); }
  if (!me()) return problem(401, 'UNAUTHENTICATED', 'Unauthorized', 'Authentication required');

  if (path === '/categories' && method === 'GET') {
    return json(200, db.categories.filter((c) => c.active).map(({ id, code, name, isSecurity, targetResolutionHours }) => ({ id, code, name, isSecurity, targetResolutionHours })));
  }
  if (path === '/me/notifications') return json(200, db.notifications);

  if (path === '/users' && method === 'GET') {
    if (!can([ROLE.COORDINATOR, ROLE.MANAGER, ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    const role = q.get('role');
    if (role && !Object.values(ROLE).includes(role)) return problem(400, 'INVALID_REQUEST', 'Bad Request', 'role is not a known role');
    const admin = can([ROLE.ADMINISTRATOR]);
    return json(200, db.users.filter((u) => !role || u.roles.includes(role))
      .map((u) => ({ id: u.id, displayName: u.displayName, roles: u.roles, ...(admin ? { email: u.email } : {}) })));
  }
  if (path === '/users' && method === 'POST') {
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    const missing = ['email', 'displayName', 'password'].find((f) => !body?.[f]);
    if (missing) return problem(400, 'INVALID_REQUEST', 'Bad Request', `The ${missing} field is required.`);
    if (!body.roles?.length) return problem(400, 'INVALID_REQUEST', 'Bad Request', 'A role is required');
    if (db.users.some((u) => u.email === body.email)) return problem(409, 'CONFLICT', 'Conflict', 'An account with that e-mail exists');
    const u = { id: `u${db.next++}`, email: body.email, displayName: body.displayName, roles: body.roles, revoked: false };
    db.users.push(u);
    return json(201, { id: u.id }, 'application/json', { Location: `/api/v1/users/${u.id}` });
  }
  if ((m = /^\/users\/([^/]+)\/(roles|revocation)$/.exec(path))) {
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    const u = db.users.find((x) => x.id === m[1]);
    if (!u) return problem(404, 'NOT_FOUND', 'Not Found', 'No such user');
    if (m[2] === 'roles') { u.roles = body?.roles ?? []; return json(200, { id: u.id, roles: u.roles }); }
    u.revoked = true;
    return json(201, { id: u.id });
  }

  if (path === '/reports/summary') {
    if (!can([ROLE.MANAGER, ROLE.COORDINATOR, ROLE.SECURITY_OFFICER])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    const rows = db.requests.filter((r) => (!q.get('categoryId') || r.categoryId === q.get('categoryId'))
      && (!q.get('from') || r.submittedAt >= q.get('from')) && (!q.get('to') || r.submittedAt <= `${q.get('to')}T23:59:59Z`));
    const byStatus = {}; const byCategory = {};
    for (const r of rows) { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; byCategory[r.categoryId] = (byCategory[r.categoryId] ?? 0) + 1; }
    const overdue = rows.filter((r) => !TERMINAL_STATUSES.includes(r.status) && Date.now() - Date.parse(r.submittedAt) > 7 * 86400000).length;
    return json(200, { byStatus, byCategory, overdue, total: rows.length });
  }

  if ((m = /^\/categories\/([^/]+)\/(target|deactivation)$/.exec(path))) {
    const c = db.categories.find((x) => x.id === m[1]);
    if (!c) return problem(404, 'NOT_FOUND', 'Not Found', 'No such category');
    if (m[2] === 'target') {
      if (!can([ROLE.MANAGER])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
      if (!Number.isFinite(body?.targetResolutionHours) || body.targetResolutionHours <= 0) return problem(400, 'INVALID_REQUEST', 'Bad Request', 'targetResolutionHours must be a positive number');
      c.targetResolutionHours = body.targetResolutionHours;
      return json(200, { id: c.id, targetResolutionHours: c.targetResolutionHours });
    }
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    c.active = false;
    return json(201, { id: c.id });
  }

  if (path === '/requests' && method === 'GET') {
    let rows = db.requests.filter((r) => (can(STAFF) ? true : r.requesterId === db.session));
    if (q.get('status')) rows = rows.filter((r) => r.status === q.get('status'));
    if (q.get('categoryId')) rows = rows.filter((r) => r.categoryId === q.get('categoryId'));
    rows = [...rows].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    if ((q.get('sort') ?? '').startsWith('-')) rows.reverse();
    return json(200, { items: rows.map(listItem), nextCursor: null });
  }
  if (path === '/requests/search' && method === 'POST') {
    const t = String(body?.text ?? '').toLowerCase();
    const rows = db.requests.filter((r) => `${r.reference} ${r.location} ${r.description}`.toLowerCase().includes(t)
      && (!body?.status || r.status === body.status) && (!body?.categoryId || r.categoryId === body.categoryId));
    return json(200, { items: rows.map(listItem), nextCursor: null });
  }
  if (path === '/requests' && method === 'POST') {
    if (!can([ROLE.REQUESTER, ROLE.COORDINATOR])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    const bad = guard(headers, null, false); if (bad) return bad;
    const field = [['category', 'categoryId'], ['location', 'location'], ['description', 'description']].find(([, k]) => !String(body?.[k] ?? '').trim());
    if (field) return problem(400, 'INVALID_REQUEST', 'Bad Request', `The ${field[0]} field is required.`);
    const key = `${db.session}:${headers.get('idempotency-key')}`;
    if (db.keys.has(key)) return db.keys.get(key).clone();
    const id = `r${db.next++}`;
    const r = { id, reference: `CC-2026-${db.next + 900}`, status: STATUS.RECEIVED, version: 1, categoryId: body.categoryId, location: body.location, description: body.description, submittedAt: new Date().toISOString(), requesterId: db.session, assigneeId: null };
    db.requests.push(r);
    db.history[id] = [{ id: `h${db.next++}`, changeType: 'created', requestVersion: 1, fromStatus: null, toStatus: STATUS.RECEIVED, body: null, actorRole: me().roles[0], occurredAt: r.submittedAt }];
    const res = json(201, view(r), 'application/json', { Location: `/api/v1/requests/${id}`, ...etag(r) });
    db.keys.set(key, res.clone());
    return res;
  }

  if ((m = /^\/requests\/([^/]+)(?:\/(history|transitions|assignments|comments|actions|details))?$/.exec(path))) {
    const r = db.requests.find((x) => x.id === m[1]);
    if (!r || (!can(STAFF) && r.requesterId !== db.session)) return problem(404, 'NOT_FOUND', 'Not Found', `Request '${m[1]}' does not exist`);
    if (!m[2]) return json(200, view(r), 'application/json', etag(r));
    if (m[2] === 'history') return json(200, db.history[r.id]);
    const sub = m[2];
    const needs = sub === 'transitions' || sub === 'assignments';
    const bad = guard(headers, r, needs); if (bad) return bad;
    if (sub === 'transitions') {
      if (!can(STAFF)) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
      const to = body?.toStatus;
      if (!Object.values(STATUS).includes(to) || to === r.status || TERMINAL_STATUSES.includes(r.status)) return problem(422, 'INVALID_TRANSITION', 'Unprocessable Content', 'That transition is not permitted from the current status');
      if (TERMINAL_STATUSES.includes(to) && !body.reason) return problem(422, 'INVALID_TRANSITION', 'Unprocessable Content', 'A reason is required');
      const from = r.status; r.status = to;
      append(r, { changeType: 'status', fromStatus: from, toStatus: to, body: body.reason ?? null });
      return json(201, db.history[r.id].at(-1), 'application/json', etag(r));
    }
    if (sub === 'assignments') {
      if (!can([ROLE.COORDINATOR, ROLE.MANAGER, ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER])) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
      r.assigneeId = body?.assigneeId;
      append(r, { changeType: 'assignment', toAssigneeId: r.assigneeId, toAssigneeName: db.users.find((u) => u.id === r.assigneeId)?.displayName });
      return json(201, db.history[r.id].at(-1), 'application/json', etag(r));
    }
    if (!can(STAFF)) return problem(403, 'FORBIDDEN', 'Forbidden', 'Forbidden');
    if (!String(body?.body ?? '').trim()) return problem(400, 'INVALID_REQUEST', 'Bad Request', 'The body field is required.');
    append(r, { changeType: sub.replace(/s$/, ''), body: body.body });
    return json(201, db.history[r.id].at(-1));
  }

  return problem(404, 'NOT_FOUND', 'Not Found', 'No resource exists at this address');
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
  if (!url.pathname.startsWith('/api/v1/')) return realFetch(input, init);
  await new Promise((resolve) => { setTimeout(resolve, 250); }); // long enough to see the loading states
  const headers = new Headers(init.headers);
  const body = init.body ? JSON.parse(init.body) : undefined;
  return route((init.method ?? 'GET').toUpperCase(), url, headers, body);
};

// OPTIONAL mock of the API, for working on screens without the server.
// Enabled only by VITE_MOCK_API=1 (or =rich) at build or dev-server start, and
// loaded by main.jsx only then. It is off by default and is dead-code removed
// from a default build. The release candidate uses the real API.
//
// Shapes follow the route and service code of the server tracks (submission,
// lists, assignment, history, management). =rich makes GET /requests/{id}
// return the expanded body (display fields and permittedTransitions); without
// it the body is only { reference, status, version }, which is the fallback the
// client must handle. The transition table below is a simplified mirror for
// screen work, not the server's model.
//
// Sign in with any e-mail below and the password "mock".

import { STATUS, ROLE, TERMINAL_STATUSES } from '../../../shared/domainValues.js';

const RICH = import.meta.env.VITE_MOCK_API === 'rich';
const PASSWORD = 'mock';
const PAGE = 4;
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
  // Category names are stored lowercase, as the server returns them.
  categories: [
    { id: 'c1', code: 'WATER', name: 'water and sanitation', isSecurity: false, targetResolutionHours: 48, active: true },
    { id: 'c2', code: 'ROADS', name: 'roads and pavements', isSecurity: false, targetResolutionHours: 72, active: true },
    { id: 'c3', code: 'LIGHT', name: 'street lighting', isSecurity: false, targetResolutionHours: 96, active: true },
    { id: 'c4', code: 'WASTE', name: 'waste collection', isSecurity: false, targetResolutionHours: 72, active: true },
    { id: 'c5', code: 'PARKS', name: 'parks and open spaces', isSecurity: false, targetResolutionHours: 120, active: true },
    { id: 'c6', code: 'ARCH', name: 'Archived services', isSecurity: false, targetResolutionHours: 24, active: false },
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
  for (let i = 0; i < 9; i += 1) {
    const id = `r${i + 1}`;
    const status = statuses[i % statuses.length];
    db.requests.push({
      id, reference: `CC-2026-${String(1000 + i).padStart(6, '0')}`, status, version: i % 7 === 0 ? 1 : 2,
      categoryId: db.categories[i % 5].id,
      location: ['Main Street', 'Oak Avenue', 'Library Square'][i % 3], description: 'Seeded description for screen work.',
      submittedAt: iso(12 - i), requesterId: 'u1',
      assigneeId: status === STATUS.RECEIVED ? null : 'u2',
      resolution: status === STATUS.RESOLVED || status === STATUS.CLOSED ? 'Seeded resolution summary.' : null,
    });
    db.history[id] = [
      { id: `${id}h1`, changeType: 'created', requestVersion: 1, fromStatus: null, toStatus: STATUS.RECEIVED, actorRole: ROLE.REQUESTER, occurredAt: iso(12 - i) },
      ...(status === STATUS.RECEIVED ? [] : [{ id: `${id}h2`, changeType: 'status', requestVersion: 2, fromStatus: STATUS.RECEIVED, toStatus: status, reason: 'Seeded reason.', actorRole: ROLE.COORDINATOR, actorId: 'u3', occurredAt: iso(11 - i) }]),
    ];
  }
  db.notifications.push({ id: 'n1', requestId: 'r2', requestReference: 'CC-2026-001001', kind: 'accepted', displayStatus: STATUS.ASSIGNED, read: false, createdAt: iso(1) });
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
const DISPOSITION = [ROLE.COORDINATOR, ROLE.MANAGER];

// A simplified mirror of the transition table, for screen work only.
const MOCK_TRANSITIONS = {
  [STATUS.RECEIVED]: [{ to: STATUS.REJECTED, roles: DISPOSITION, reason: true }],
  [STATUS.ASSIGNED]: [{ to: STATUS.IN_PROGRESS, roles: STAFF }, { to: STATUS.ON_HOLD, roles: STAFF }, { to: STATUS.REJECTED, roles: DISPOSITION, reason: true }],
  [STATUS.IN_PROGRESS]: [{ to: STATUS.ON_HOLD, roles: STAFF }, { to: STATUS.RESOLVED, roles: STAFF, resolution: true }, { to: STATUS.REJECTED, roles: DISPOSITION, reason: true }],
  [STATUS.ON_HOLD]: [{ to: STATUS.IN_PROGRESS, roles: STAFF }, { to: STATUS.REJECTED, roles: DISPOSITION, reason: true }],
  [STATUS.RESOLVED]: [{ to: STATUS.CLOSED, roles: DISPOSITION, reason: true }, { to: STATUS.IN_PROGRESS, roles: STAFF }],
  [STATUS.CLOSED]: [],
  [STATUS.REJECTED]: [],
};
const permittedFor = (r) => (MOCK_TRANSITIONS[r.status] ?? [])
  .filter((t) => can(t.roles))
  .map((t) => ({ toStatus: t.to, requiresReason: Boolean(t.reason), requiresResolution: Boolean(t.resolution) }));

const OPEN_FOR_ASSIGNMENT = [STATUS.RECEIVED, STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.ON_HOLD];
const permittedAssignmentFor = (r) => {
  const open = OPEN_FOR_ASSIGNMENT.includes(r.status);
  const assign = open && can([ROLE.COORDINATOR, ROLE.MANAGER]);
  return {
    assign,
    accept: open && !r.assigneeId && can([ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER]),
    // Mirrors the server's decision #10 pool: Security Officers for a security request.
    assigneeRoles: assign ? [r.securityCategory ? ROLE.SECURITY_OFFICER : ROLE.TECHNICIAN] : [],
  };
};

// The assignee's name goes only to the roles that may assign (Coordinator, Manager).
const nameOfAssignee = (r) => (r.assigneeId && can([ROLE.COORDINATOR, ROLE.MANAGER])
  ? { assigneeName: db.users.find((u) => u.id === r.assigneeId)?.displayName }
  : {});

function view(r) {
  const base = { reference: r.reference, status: r.status, version: r.version };
  if (!RICH) return base;
  const out = {
    ...base, categoryId: r.categoryId, location: r.location, submittedAt: r.submittedAt,
    permittedTransitions: can(STAFF) ? permittedFor(r) : [],
    permittedAssignment: permittedAssignmentFor(r),
  };
  if (r.assigneeId) Object.assign(out, { assigneeId: r.assigneeId }, nameOfAssignee(r));
  if (r.description) out.description = r.description;
  if (r.resolution) out.resolution = r.resolution;
  return out;
}
const listItem = (r) => ({
  id: r.id, reference: r.reference, status: r.status, categoryId: r.categoryId,
  location: r.location, submittedAt: r.submittedAt, assigneeId: r.assigneeId ?? null, ...nameOfAssignee(r),
});
const etag = (r) => ({ ETag: `"v${r.version}"` });

/** Idempotency-Key, and If-Match where the route needs it (DEC-015 §2-3). */
function guard(headers, r, needMatch) {
  if (!headers.get('idempotency-key')) return problem(400, 'IDEMPOTENCY_KEY_REQUIRED', 'IdempotencyKeyRequiredError', 'Idempotency-Key is required on a state-changing request');
  if (needMatch) {
    const m = headers.get('if-match');
    if (!m) return problem(428, 'PRECONDITION_REQUIRED', 'PreconditionRequiredError', 'If-Match is required on a state-changing request');
    if (m !== `"v${r.version}"`) return problem(412, 'PRECONDITION_FAILED', 'PreconditionFailedError', `Request '${r.id}' is no longer at version ${m}`);
  }
  return null;
}

function append(r, entry) {
  r.version += 1;
  db.history[r.id].push({ id: `h${db.next++}`, requestVersion: r.version, actorRole: me().roles[0], actorId: db.session, occurredAt: new Date().toISOString(), ...entry });
}

/** Cursor paging over an already ordered list: the cursor is the offset. */
function page(rows, cursor) {
  const from = cursor ? Number(cursor) : 0;
  const slice = rows.slice(from, from + PAGE);
  return { items: slice.map(listItem), nextCursor: from + PAGE < rows.length ? String(from + PAGE) : null };
}

/** The list scope: staff see everything in the mock; a requester sees their own; anyone else is refused. */
function scoped() {
  if (can(STAFF)) return db.requests;
  if (can([ROLE.REQUESTER])) return db.requests.filter((r) => r.requesterId === db.session);
  return null;
}

function listRows(params) {
  const base = scoped();
  if (!base) return null;
  let rows = base.filter((r) => (!params.status || r.status === params.status)
    && (!params.categoryId || r.categoryId === params.categoryId)
    && (params.assigneeId !== 'none' || !r.assigneeId));
  rows = [...rows].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  if ((params.sort ?? '-submittedAt').startsWith('-')) rows.reverse();
  return rows;
}

function route(method, url, headers, body) {
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const q = url.searchParams;
  let m;

  if (path === '/health') return json(200, { application: 'up', database: 'up' });
  if (path === '/sessions' && method === 'POST') {
    const u = db.users.find((x) => x.email === body?.email && !x.revoked);
    if (!u || body.password !== PASSWORD) return problem(401, 'UNAUTHENTICATED', 'AuthenticationError', 'Authentication required');
    db.session = u.id;
    return json(201, { id: u.id, displayName: u.displayName, roles: u.roles });
  }
  if (path === '/sessions/current' && method === 'DELETE') { db.session = null; return json(204); }
  if (!me()) return problem(401, 'UNAUTHENTICATED', 'AuthenticationError', 'Authentication required');

  if (path === '/categories' && method === 'GET') {
    const withTarget = can([ROLE.MANAGER, ROLE.ADMINISTRATOR]);
    const admin = can([ROLE.ADMINISTRATOR]);
    // Inactive categories go to the Administrator only (with active: false); names sort A to Z ignoring case.
    return json(200, [...db.categories].filter((c) => c.active || admin)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .map(({ id, code, name, isSecurity, targetResolutionHours, active }) => ({
        id, code, name, isSecurity, ...(admin ? { active } : {}), ...(withTarget ? { targetResolutionHours } : {}),
      })));
  }
  if (path === '/me/notifications') return json(200, { notifications: db.notifications });

  if (path === '/users' && method === 'GET') {
    if (!can([ROLE.COORDINATOR, ROLE.MANAGER, ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    const role = q.get('role');
    if (role && !Object.values(ROLE).includes(role)) return problem(400, 'INVALID_REQUEST', 'ValidationError', 'role must be one of the defined roles');
    const admin = can([ROLE.ADMINISTRATOR]);
    return json(200, db.users.filter((u) => (admin || !u.revoked) && (!role || u.roles.includes(role)))
      .map((u) => ({
        id: u.id, displayName: u.displayName, roles: u.roles,
        ...(admin ? { email: u.email, status: u.revoked ? 'revoked' : 'active', ...(u.revoked ? { revokedAt: u.revokedAt } : {}) } : {}),
      })));
  }
  if (path === '/users' && method === 'POST') {
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    const bad = guard(headers, null, false); if (bad) return bad;
    const missing = ['email', 'displayName', 'password'].find((f) => !String(body?.[f] ?? '').trim());
    if (missing) return problem(400, 'INVALID_REQUEST', 'ValidationError', `${missing} is required`);
    if (!body.roles?.length) return problem(400, 'INVALID_REQUEST', 'ValidationError', 'A role is required');
    if (db.users.some((u) => u.email === body.email)) return problem(409, 'CONFLICT', 'ConflictError', 'An account with that e-mail already exists');
    const u = { id: `u${db.next++}`, email: body.email, displayName: body.displayName, roles: body.roles, revoked: false };
    db.users.push(u);
    return json(201, { id: u.id, email: u.email, displayName: u.displayName, roles: u.roles }, 'application/json', { Location: `/api/v1/users/${u.id}` });
  }
  if ((m = /^\/users\/([^/]+)\/(roles|revocation)$/.exec(path))) {
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    const bad = guard(headers, null, false); if (bad) return bad;
    const u = db.users.find((x) => x.id === m[1]);
    if (!u) return problem(404, 'NOT_FOUND', 'NotFoundError', `User '${m[1]}' does not exist`);
    if (m[2] === 'roles') {
      if (!body?.roles?.length) return problem(400, 'INVALID_REQUEST', 'ValidationError', 'A role is required');
      u.roles = body.roles; return json(200, { id: u.id, roles: u.roles });
    }
    const replayed = u.revoked;
    u.revoked = true; u.revokedAt = u.revokedAt ?? new Date().toISOString();
    return json(replayed ? 200 : 201, { id: u.id, status: 'revoked', revokedAt: new Date().toISOString(), replayed });
  }

  if (path === '/reports/summary') {
    if (!can([ROLE.MANAGER, ROLE.COORDINATOR, ROLE.SECURITY_OFFICER])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    const rows = db.requests.filter((r) => (!q.get('categoryId') || r.categoryId === q.get('categoryId'))
      && (!q.get('from') || r.submittedAt >= q.get('from')) && (!q.get('to') || r.submittedAt <= `${q.get('to')}T23:59:59Z`));
    const byStatus = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    for (const r of rows) byStatus[r.status] += 1;
    const byCategory = db.categories.map((c) => ({
      categoryId: c.id, code: c.code, name: c.name, active: c.active, count: rows.filter((r) => r.categoryId === c.id).length,
    }));
    const requests = rows
      .filter((r) => !TERMINAL_STATUSES.includes(r.status))
      .map((r) => ({ r, hours: Math.floor((Date.now() - Date.parse(r.submittedAt)) / 3600000), target: db.categories.find((c) => c.id === r.categoryId)?.targetResolutionHours }))
      .filter(({ hours, target }) => target != null && hours > target)
      .map(({ r, hours }) => ({ id: r.id, reference: r.reference, categoryId: r.categoryId, status: r.status, openHours: hours }));
    return json(200, { byStatus, byCategory, overdue: { count: requests.length, requests }, total: rows.length });
  }

  if ((m = /^\/categories\/([^/]+)\/(target|deactivation)$/.exec(path))) {
    const bad = guard(headers, null, false); if (bad) return bad;
    const c = db.categories.find((x) => x.id === m[1]);
    if (m[2] === 'target') {
      if (!can([ROLE.MANAGER])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
      if (!c) return problem(404, 'NOT_FOUND', 'NotFoundError', `Category '${m[1]}' does not exist`);
      if (typeof body?.targetResolutionHours !== 'number' || body.targetResolutionHours < 1) return problem(400, 'INVALID_REQUEST', 'ValidationError', 'targetResolutionHours must be a number of at least 1');
      c.targetResolutionHours = body.targetResolutionHours;
      return json(200, { id: c.id, targetResolutionHours: c.targetResolutionHours });
    }
    if (!can([ROLE.ADMINISTRATOR])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    if (!c) return problem(404, 'NOT_FOUND', 'NotFoundError', `Category '${m[1]}' does not exist`);
    const replayed = !c.active;
    c.active = false;
    return json(replayed ? 200 : 201, { id: c.id, active: false, replayed });
  }

  if (path === '/requests' && method === 'GET') {
    const rows = listRows({ status: q.get('status'), categoryId: q.get('categoryId'), assigneeId: q.get('assigneeId'), sort: q.get('sort') });
    if (!rows) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    return json(200, page(rows, q.get('cursor')));
  }
  if (path === '/requests/search' && method === 'POST') {
    if (!can(STAFF)) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Search is available to staff only');
    const t = String(body?.text ?? '').toLowerCase();
    if (!t) return problem(400, 'INVALID_REQUEST', 'ValidationError', "Parameter 'text' is required");
    const rows = listRows(body).filter((r) => `${r.reference} ${r.location} ${r.description}`.toLowerCase().includes(t));
    return json(200, page(rows, body.cursor));
  }
  if (path === '/requests' && method === 'POST') {
    if (!can([ROLE.REQUESTER, ROLE.COORDINATOR])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    const bad = guard(headers, null, false); if (bad) return bad;
    const missing = ['categoryId', 'location', 'description'].find((k) => !String(body?.[k] ?? '').trim());
    if (missing) return problem(400, 'INVALID_REQUEST', 'ValidationError', `'${missing}' is required`);
    const key = `${db.session}:${headers.get('idempotency-key')}`;
    if (db.keys.has(key)) return db.keys.get(key).clone();
    if (!db.categories.some((c) => c.id === body.categoryId && c.active)) return problem(422, 'CATEGORY_NOT_SELECTABLE', 'CategoryNotSelectableError', 'The category is not in the active list');
    const id = `r${db.next++}`;
    const r = { id, reference: `CC-2026-${String(db.next + 900).padStart(6, '0')}`, status: STATUS.RECEIVED, version: 1, categoryId: body.categoryId, location: body.location.trim(), description: body.description.trim(), submittedAt: new Date().toISOString(), requesterId: db.session, assigneeId: null };
    db.requests.push(r);
    db.history[id] = [{ id: `h${db.next++}`, changeType: 'created', requestVersion: 1, fromStatus: null, toStatus: STATUS.RECEIVED, actorRole: me().roles[0], occurredAt: r.submittedAt }];
    const res = json(201, { id, reference: r.reference, status: r.status, version: r.version, submittedAt: r.submittedAt }, 'application/json', { Location: `/api/v1/requests/${id}`, ...etag(r) });
    // A replay returns the original status and body, with this header (DEC-015 §3).
    db.keys.set(key, json(201, { id, reference: r.reference, status: r.status, version: r.version, submittedAt: r.submittedAt }, 'application/json', { Location: `/api/v1/requests/${id}`, ...etag(r), 'Idempotent-Replayed': 'true' }));
    return res;
  }

  if ((m = /^\/requests\/([^/]+)(?:\/(history|transitions|assignments|comments|actions|details))?$/.exec(path))) {
    const r = db.requests.find((x) => x.id === m[1]);
    if (!r || (!can(STAFF) && r.requesterId !== db.session)) return problem(404, 'NOT_FOUND', 'NotFoundError', `Request '${m[1]}' does not exist`);
    if (!m[2]) return json(200, view(r), 'application/json', etag(r));
    if (m[2] === 'history') return json(200, { requestId: r.id, entries: db.history[r.id] });
    const sub = m[2];
    const needs = sub === 'transitions' || sub === 'assignments';
    const bad = guard(headers, r, needs); if (bad) return bad;
    if (sub === 'transitions') {
      if (!can(STAFF)) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
      const to = body?.toStatus;
      const move = permittedFor(r).find((t) => t.toStatus === to);
      if (!move) return problem(422, 'INVALID_TRANSITION', 'TransitionError', `'${r.status}' may not move to '${to}' for this role`);
      if (move.requiresReason && !body.reason) return problem(422, 'INVALID_TRANSITION', 'TransitionError', `A recorded reason is required to move to '${to}'`);
      if (move.requiresResolution && !body.resolution) return problem(422, 'INVALID_TRANSITION', 'TransitionError', 'Resolution information is required before the request can be resolved');
      const from = r.status; r.status = to;
      if (body.resolution) r.resolution = body.resolution;
      append(r, { changeType: 'status', fromStatus: from, toStatus: to, reason: body.reason ?? null, ...(body.resolution ? { resolution: body.resolution } : {}) });
      return json(201, { requestId: r.id, fromStatus: from, toStatus: to, version: r.version }, 'application/json', etag(r));
    }
    if (sub === 'assignments') {
      if (!can([ROLE.COORDINATOR, ROLE.MANAGER, ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER])) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
      if (!db.users.some((u) => u.id === body?.assigneeId)) return problem(400, 'INVALID_REQUEST', 'ValidationError', 'assigneeId is required and must be a user identifier');
      const first = !r.assigneeId;
      const from = r.assigneeId ?? null;
      r.assigneeId = body.assigneeId;
      if (first && r.status === STATUS.RECEIVED) r.status = STATUS.ASSIGNED;
      append(r, { changeType: 'assignment', fromAssigneeId: from, toAssigneeId: r.assigneeId, ...(first ? { fromStatus: STATUS.RECEIVED, toStatus: r.status } : {}) });
      return json(201, { requestId: r.id, toAssigneeId: r.assigneeId, status: r.status, version: r.version }, 'application/json', etag(r));
    }
    // Comments, actions and details change the version too, with no If-Match (DB-01).
    const allowed = sub === 'details' ? can([ROLE.REQUESTER]) : can(STAFF);
    if (!allowed) return problem(403, 'FORBIDDEN', 'AuthorisationError', 'Forbidden');
    if (!String(body?.body ?? '').trim()) return problem(400, 'INVALID_REQUEST', 'ValidationError', "'body' is required");
    append(r, { changeType: sub.replace(/s$/, ''), body: body.body.trim() });
    return json(201, { requestId: r.id, changeType: sub.replace(/s$/, ''), version: r.version }, 'application/json', etag(r));
  }

  return problem(404, 'NOT_FOUND', 'RouteNotFoundError', 'No resource exists at this address');
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

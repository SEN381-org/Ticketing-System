/**
 * Shared test harness for the M4 management and administration tests
 * (DEC-015 Addendum A, A2 to A8). Not a test file.
 *
 * The REAL app, session middleware, auth service and the three T7 services run
 * over real HTTP; only persistence is faked, with in-memory stores that follow
 * each repository interface. The user store is shared between the auth service
 * and the user-administration repository, so a revocation made through the API is
 * seen by the next session resolution.
 */

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createReportService } from '../src/services/reportService.js';
import { createUserAdminService } from '../src/services/userAdminService.js';
import { createCategoryAdminService } from '../src/services/categoryAdminService.js';
import { validateRoles } from '../src/repositories/userAdminRepository.js';
import { ConflictError } from '../src/errors.js';
import { ROLE } from '../src/models/_shared.js';

export const CAMPUS = 'c0000000000000000000000a';
export const CAT = {
  roads:    'aa0000000000000000000001',
  lights:   'aa0000000000000000000002',
  security: 'aa0000000000000000000003',
  old:      'aa0000000000000000000004',
};
export const HOUR = 60 * 60 * 1000;
export const NOW = new Date('2026-10-17T12:00:00.000Z');

export const USER = Object.freeze({
  coord: 'ee0000000000000000000001', req: 'ee0000000000000000000002', tech: 'ee0000000000000000000004',
  mgr: 'ee0000000000000000000005', admin: 'ee0000000000000000000006', sec: 'ee0000000000000000000008',
});

const user = (id, email, roles, extra = {}) => ({
  _id: id, campusId: CAMPUS, email, displayName: `Name of ${id}`, passwordHash: 'fake$right',
  roles, categoryAuthorisations: [], groupIds: [], status: 'active', sessionEpoch: 0,
  revokedAt: null, ...extra,
});

export function seedUsers() {
  return new Map([
    [USER.coord, user(USER.coord, 'coord@example.test', [ROLE.COORDINATOR])],
    [USER.req, user(USER.req, 'req@example.test', [ROLE.REQUESTER])],
    [USER.tech, user(USER.tech, 'tech@example.test', [ROLE.TECHNICIAN], { categoryAuthorisations: [CAT.roads] })],
    [USER.mgr, user(USER.mgr, 'mgr@example.test', [ROLE.MANAGER])],
    [USER.admin, user(USER.admin, 'admin@example.test', [ROLE.ADMINISTRATOR])],
    [USER.sec, user(USER.sec, 'sec@example.test', [ROLE.SECURITY_OFFICER])],
  ]);
}

export function seedCategories() {
  const c = (id, code, extra = {}) => ({
    _id: id, campusId: CAMPUS, code, name: `${code} name`, isSecurity: false,
    targetResolutionHours: null, active: true, ...extra,
  });
  return new Map([
    [CAT.roads, c(CAT.roads, 'ROADS', { targetResolutionHours: 48 })],
    [CAT.lights, c(CAT.lights, 'LIGHTS')],
    [CAT.security, c(CAT.security, 'SECURITY', { isSecurity: true, targetResolutionHours: 24 })],
    [CAT.old, c(CAT.old, 'OLD', { active: false })],
  ]);
}

/** @param {{id: string, categoryId: string, status: string, hoursAgo: number, security?: boolean}} spec */
export function makeRequest(spec, n) {
  return {
    _id: `bb${String(n).padStart(22, '0')}`, campusId: CAMPUS,
    reference: `CC-2026-${String(n).padStart(6, '0')}`,
    categoryId: spec.categoryId, status: spec.status,
    securityCategory: Boolean(spec.security),
    submittedAt: new Date(NOW.getTime() - spec.hoursAgo * HOUR),
    // Sensitive content a leaking repository or service would expose (FR-8.6).
    description: `SECRET-DESCRIPTION-${n}`, location: `SECRET-LOCATION-${n}`,
    comments: [`SECRET-COMMENT-${n}`], actions: [`SECRET-ACTION-${n}`],
  };
}

export function harness({
  requests = [], users = seedUsers(), categories = seedCategories(),
  adminPasswords, log = { error() {} },
} = {}) {
  const store = { users, categories, requests };
  const sessions = new Map();
  const passwords = {
    hash: async (p) => `fake$${p}`,
    verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }),
  };

  const authService = createAuthService({
    users: {
      findForLogin: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findById: async (id) => users.get(String(id)) ?? null,
      updatePasswordHash: async () => {},
    },
    sessions: {
      create: async (s) => { sessions.set(s._id, { ...s }); },
      findById: async (id) => sessions.get(id) ?? null,
      touch: async () => {},
      remove: async (id) => { const s = sessions.get(id) ?? null; sessions.delete(id); return s; },
    },
    audit: { recordSecurityEvent: async () => {} },
    passwords,
  });

  // ---- fake repositories, one per interface the services use ----
  const calls = { reports: [] };
  const inRange = (r, { from, to, categoryId }) =>
    (!categoryId || r.categoryId === categoryId)
    && (!from || r.submittedAt >= from) && (!to || r.submittedAt <= to);

  const reports = {
    countByStatusAndCategory: async (filter) => {
      calls.reports.push(filter);
      const tally = new Map();
      for (const r of store.requests.filter((x) => inRange(x, filter))) {
        const key = `${r.status}|${r.categoryId}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      return [...tally].map(([key, count]) => {
        const [status, categoryId] = key.split('|');
        return { status, categoryId, count };
      });
    },
    // Deliberately returns whole documents: a leak must be stopped by the service.
    findOpen: async (filter, closed) =>
      store.requests.filter((r) => inRange(r, filter) && !closed.includes(r.status)),
  };

  const categoriesRepo = {
    listAll: async () => [...store.categories.values()].map((c) => ({ ...c })),
    findById: async (id) => (store.categories.has(id) ? { ...store.categories.get(id) } : null),
    setTarget: async (id, campusId, hours) => {
      if (!store.categories.has(id)) return false;
      store.categories.get(id).targetResolutionHours = hours;
      return true;
    },
    deactivate: async (id) => {
      const c = store.categories.get(id);
      if (!c || !c.active) return false;
      c.active = false;
      return true;
    },
  };

  const campusScoped = (u) => u && u.campusId === CAMPUS;
  const usersRepo = {
    list: async ({ role, categoryId }) => [...users.values()].filter((u) =>
      u.status === 'active' && (!role || u.roles.includes(role))
      && (!categoryId || u.categoryAuthorisations.includes(categoryId))),
    findById: async (id) => (campusScoped(users.get(id)) ? { ...users.get(id) } : null),
    findByEmail: async (email) => [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
    create: async (doc) => {
      if ([...users.values()].some((u) => u.email === doc.email.toLowerCase())) {
        throw new ConflictError('An account with that e-mail already exists');
      }
      const created = { ...user(`ff${String(users.size + 100).padStart(22, '0')}`, doc.email.toLowerCase(), doc.roles), ...doc };
      users.set(created._id, created);
      return { ...created };
    },
    setRoles: async (id, campusId, roles) => {
      if (!users.has(id)) return false;
      users.get(id).roles = [...roles];
      return true;
    },
    revoke: async (id, campusId, revokedAt) => {
      const u = users.get(id);
      if (!u || u.status !== 'active') return false;
      Object.assign(u, { status: 'revoked', revokedAt, sessionEpoch: u.sessionEpoch + 1 });
      return true;
    },
  };

  const app = createApp({
    authService,
    healthService: createHealthService({ pingDatabase: async () => {} }),
    statusTransitionService: {}, requestQueryService: {},
    reportService: createReportService({
      reports, categories: categoriesRepo, clock: () => NOW,
    }),
    userAdminService: createUserAdminService({ users: usersRepo, passwords: adminPasswords ?? passwords, validateRoles }),
    categoryAdminService: createCategoryAdminService({ categories: categoriesRepo }),
    log,
  });
  return { app, store, calls, sessions };
}

export async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function login(base, email) {
  const res = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'right' }),
  });
  return res.headers.getSetCookie()[0].split(';')[0];
}

let keyCounter = 0;

/** Sends JSON with a fresh Idempotency-Key unless `key: null`. */
export function send(base, method, path, { cookie, body = {}, key = `k-${++keyCounter}`, headers = {} } = {}) {
  return fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...headers,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

export const getJson = (base, path, cookie) =>
  fetch(`${base}/api/v1${path}`, { headers: cookie ? { cookie } : {} });

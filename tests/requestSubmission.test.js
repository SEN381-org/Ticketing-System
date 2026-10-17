/**
 * POST /api/v1/requests and GET /api/v1/categories — request submission.
 *
 * Traces to: FR-2.1, FR-2.2, FR-2.3, FR-2.5, FR-2.6, AC-FR-2.1, AC-FR-2.2a,
 *            AC-FR-2.2b, AC-FR-2.3, AC-FR-2.5, AC-FR-2.6, NFR-3.3, DB-01,
 *            DEC-015 §1, §3, §4, §5, DEC-015 Addendum A1, DEC-016.
 *
 * HTTP tests use the real createApp, session middleware, auth service and
 * submission service over real HTTP. Only persistence is faked. The fake unit of
 * work stages writes that carry its session and commits them only if the
 * callback resolves; a write made without the session lands in the store at
 * once. A write that escapes the transaction is therefore visible to the
 * assertions, and a rolled-back transaction leaves nothing behind.
 *
 * What this does NOT show: behaviour against a real cluster (a real transaction,
 * the unique indexes, the counter under concurrent load), or the form in the
 * browser. AC-FR-2.5 is shown on the stored document and its history entry; the
 * only read route today (GET /requests/:id, FR-4.2 provisional) returns
 * reference, status and version only, so retrieval of the submitter and time is
 * not shown through the interface.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestSubmissionService } from '../src/services/requestSubmissionService.js';
import { createCategoryService } from '../src/services/categoryService.js';
import { OPERATION_RULES } from '../src/domain/accessRules.js';
import Request from '../src/models/Request.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const CAMPUS = 'campus-1';
const CAT_ACTIVE   = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CAT_SECURITY = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CAT_INACTIVE = 'cccccccccccccccccccccccc';
const CAT_OTHER    = 'dddddddddddddddddddddddd';
const CAT_UNKNOWN  = 'eeeeeeeeeeeeeeeeeeeeeeee';
const NOW = new Date('2026-10-17T08:30:00.000Z');
const REFERENCE = /^CC-\d{4}-\d{6}$/;

const user = (id, roles, campusId = CAMPUS) => ({
  _id: id, campusId, email: `${id}@example.test`, displayName: id, passwordHash: 'fake$right',
  roles, categoryAuthorisations: [], groupIds: [], status: 'active', sessionEpoch: 0,
});

const CATEGORY_DOCS = [
  { _id: CAT_ACTIVE,   campusId: CAMPUS,      code: 'POTHOLE', name: 'Pothole',  isSecurity: false, active: true,
    targetResolutionHours: 48 },
  { _id: CAT_SECURITY, campusId: CAMPUS,      code: 'THREAT',  name: 'Threat',   isSecurity: true,  active: true },
  { _id: CAT_INACTIVE, campusId: CAMPUS,      code: 'OLD',     name: 'Retired',  isSecurity: false, active: false },
  { _id: CAT_OTHER,    campusId: 'campus-2',  code: 'OTHER',   name: 'Elsewhere', isSecurity: false, active: true },
];

/** In-memory persistence with a staging unit of work. */
function persistence({ failHistoryAppend = false } = {}) {
  const store = { requests: [], history: [], counters: new Map() };
  const calls = { sessions: { uow: [], create: [], append: [], counter: [], category: [] } };
  const write = (session, apply) => { if (session) session.staged.push(apply); else apply(); };

  const unitOfWork = {
    async run(work) {
      const session = { id: `session-${calls.sessions.uow.length + 1}`, staged: [] };
      calls.sessions.uow.push(session);
      await work(session);                      // a rejection leaves `staged` uncommitted
      session.staged.forEach((apply) => apply());
    },
  };

  const requests = {
    findById: async (id) => store.requests.find((r) => String(r._id) === String(id)) ?? null,
    create: async (doc, { session } = {}) => {
      calls.sessions.create.push(session);
      const created = { ...doc, _id: `req-${store.requests.length + 1}-${doc.reference}` };
      write(session, () => store.requests.push(created));
      return created;
    },
  };
  const history = {
    findByIdempotencyKey: async (actorId, key) =>
      store.history.find((h) => h.actorId === actorId && h.idempotencyKey === key) ?? null,
    append: async (entry, { session } = {}) => {
      calls.sessions.append.push(session);
      if (failHistoryAppend) throw new Error('history write failed');
      write(session, () => store.history.push({ ...entry, _id: `h${store.history.length + 1}` }));
      return { _id: 'h' };
    },
  };
  const counters = {
    next: async (campusId, year, { session } = {}) => {
      calls.sessions.counter.push(session);
      const id = `request-ref:${campusId}:${year}`;
      const seq = (store.counters.get(id) ?? 0) + 1;
      write(session, () => store.counters.set(id, seq));
      return seq;
    },
  };
  const categories = {
    listActive: async (campusId) => CATEGORY_DOCS.filter((c) => c.campusId === campusId && c.active),
    findActiveById: async (campusId, id, { session } = {}) => {
      calls.sessions.category.push(session);
      return CATEGORY_DOCS.find((c) => c._id === id && c.campusId === campusId && c.active) ?? null;
    },
  };
  return { store, calls, unitOfWork, requests, history, counters, categories };
}

const USERS = [
  user('requester', [ROLE.REQUESTER]),
  user('coordinator', [ROLE.COORDINATOR]),
  user('technician', [ROLE.TECHNICIAN]),
  user('manager', [ROLE.MANAGER]),
  user('security', [ROLE.SECURITY_OFFICER]),
  user('admin', [ROLE.ADMINISTRATOR]),
];

function harness(options) {
  const p = persistence(options);
  const users = new Map(USERS.map((u) => [u._id, u]));
  const sessions = new Map();
  const usersRepo = { findById: async (id) => users.get(String(id)) ?? null };
  const authService = createAuthService({
    users: {
      findForLogin: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findById: usersRepo.findById,
      updatePasswordHash: async () => {},
    },
    sessions: {
      create: async (s) => { sessions.set(s._id, { ...s }); },
      findById: async (id) => sessions.get(id) ?? null,
      touch: async () => {},
      remove: async (id) => { const s = sessions.get(id) ?? null; sessions.delete(id); return s; },
    },
    audit: { recordSecurityEvent: async () => {} },
    passwords: {
      hash: async (pw) => `fake$${pw}`,
      verify: async (pw, h) => ({ ok: h === `fake$${pw}`, needsRehash: false }),
    },
  });
  const requestSubmissionService = createRequestSubmissionService({
    requests: p.requests, history: p.history, categories: p.categories, counters: p.counters,
    users: usersRepo, unitOfWork: p.unitOfWork, clock: () => NOW,
  });
  const categoryService = createCategoryService({ categories: p.categories, users: usersRepo });
  const app = createApp({
    authService, healthService: createHealthService({ pingDatabase: async () => {} }),
    requestSubmissionService, categoryService, log: { error() {} },
  });
  return { app, ...p, requestSubmissionService };
}

async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function login(base, name) {
  const res = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}@example.test`, password: 'right' }),
  });
  return res.headers.getSetCookie()[0].split(';')[0];
}

const VALID = { categoryId: CAT_ACTIVE, location: 'Corner of Main and 2nd', description: 'Deep pothole in the left lane' };
let keyCounter = 0;
const freshKey = () => `key-${++keyCounter}`;

function submit(base, cookie, body = VALID, { key = freshKey(), headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers };
  if (key !== null) h['idempotency-key'] = key;
  return fetch(`${base}/api/v1/requests`, { method: 'POST', headers: h, body: JSON.stringify(body) });
}

const nothingStored = (h) => {
  assert.equal(h.store.requests.length, 0, 'no request may be stored');
  assert.equal(h.store.history.length, 0, 'no history entry may be stored');
  assert.equal(h.store.counters.size, 0, 'no reference number may be consumed');
};

// ---------- AC-FR-2.1 / AC-FR-2.2a ----------

test('AC-FR-2.1: a Requester submits and the system stores a new request and returns its reference — FR-2.1, DEC-015 §1', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'));
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.reference, REFERENCE);
    assert.equal(body.reference, 'CC-2026-000001');
    assert.equal(res.headers.get('etag'), '"v1"');
    assert.equal(res.headers.get('location'), `/api/v1/requests/${body.id}`);
    assert.equal(res.headers.get('idempotent-replayed'), null, 'a first submission is not a replay');

    assert.equal(h.store.requests.length, 1, 'exactly one request stored');
    const stored = h.store.requests[0];
    assert.equal(stored.reference, body.reference);
    assert.equal(stored.status, STATUS.RECEIVED);
    assert.equal(stored.version, 1);
    assert.equal(body.status, STATUS.RECEIVED);
    assert.equal(body.version, 1);
    assert.equal(stored.campusId, CAMPUS);
    assert.equal(stored.description, VALID.description);
    assert.equal(stored.location, VALID.location);
    assert.equal(stored.categoryId, CAT_ACTIVE);
  });
});

test('AC-FR-2.2a: category, location and description alone are accepted — FR-2.2', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'),
      { categoryId: CAT_ACTIVE, location: 'Library', description: 'Broken light' });
    assert.equal(res.status, 201);
    assert.equal(h.store.requests.length, 1);
  });
});

// ---------- AC-FR-2.2b ----------

for (const field of ['categoryId', 'location', 'description']) {
  test(`AC-FR-2.2b: '${field}' absent, empty or blank is rejected, names the field and stores nothing — FR-2.2`, async () => {
    const h = harness();
    await serve(h.app, async (base) => {
      const cookie = await login(base, 'requester');
      for (const mutate of [
        (b) => { delete b[field]; },
        (b) => { b[field] = ''; },
        (b) => { b[field] = '   '; },
      ]) {
        const body = { ...VALID };
        mutate(body);
        const res = await submit(base, cookie, body);
        assert.equal(res.status, 400);
        const problem = await res.json();
        assert.equal(problem.code, 'INVALID_REQUEST');
        assert.ok(problem.detail.includes(`'${field}'`), `detail must name '${field}': ${problem.detail}`);
      }
      nothingStored(h);
    });
  });
}

test('DEC-015 §5: an unknown field is rejected and named, and nothing is stored — FR-2.2 (nothing else is mandatory or accepted)', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'), { ...VALID, status: STATUS.CLOSED });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).detail.includes("'status'"));
    nothingStored(h);
  });
});

// ---------- AC-FR-2.3 ----------

test('AC-FR-2.3: a malformed category identifier is a 400, not a 500, and nothing is stored — DEC-015 §5', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'), { ...VALID, categoryId: 'not-an-id' });
    assert.equal(res.status, 400);
    assert.ok((await res.json()).detail.includes("'categoryId'"));
    nothingStored(h);
  });
});

for (const [label, categoryId] of [
  ['deactivated (FR-9.1)', CAT_INACTIVE],
  ['of another campus (SCP-019)', CAT_OTHER],
  ['absent from the list', CAT_UNKNOWN],
]) {
  test(`AC-FR-2.3: a well-formed category ${label} is rejected with 422 and no request is stored — FR-2.3, DEC-015 §4`, async () => {
    const h = harness();
    await serve(h.app, async (base) => {
      const res = await submit(base, await login(base, 'requester'), { ...VALID, categoryId });
      assert.equal(res.status, 422);
      assert.equal((await res.json()).code, 'CATEGORY_NOT_SELECTABLE');
      nothingStored(h);
    });
  });
}

// ---------- AC-FR-2.5 / AC-FR-2.6 ----------

test('AC-FR-2.5: the stored request and its history entry carry the submitting user, the date and the time — FR-2.5', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    await submit(base, await login(base, 'requester'));
    const stored = h.store.requests[0];
    assert.equal(stored.submittedById, 'requester');
    assert.equal(stored.requesterId, 'requester');
    assert.equal(stored.submittedAt.toISOString(), NOW.toISOString());
    assert.equal(stored.statusChangedAt.toISOString(), NOW.toISOString());

    const entry = h.store.history[0];
    assert.equal(entry.changeType, 'created');
    assert.equal(entry.actorId, 'requester');
    assert.equal(entry.actorRole, ROLE.REQUESTER);
    assert.equal(entry.occurredAt.toISOString(), NOW.toISOString());
    assert.equal(entry.requestVersion, 1);
    assert.equal(entry.toStatus, STATUS.RECEIVED);
    assert.equal(entry.fromStatus, null);
    assert.equal(String(entry.requestId), String(stored._id));
  });
});

test('AC-FR-2.6: references of separate submissions are different and follow the CC-yyyy-nnnnnn form — FR-2.6', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const cookie = await login(base, 'requester');
    const a = await (await submit(base, cookie)).json();
    const b = await (await submit(base, cookie)).json();
    assert.match(a.reference, REFERENCE);
    assert.match(b.reference, REFERENCE);
    assert.notEqual(a.reference, b.reference);
    assert.deepEqual([a.reference, b.reference], ['CC-2026-000001', 'CC-2026-000002']);
  });
});

test('AC-FR-2.6: the reference is immutable on the model, so it does not change for the life of the request — FR-2.6', () => {
  assert.equal(Request.schema.path('reference').options.immutable, true);
});

test('FR-1.5: the security flag of the category is snapshotted onto the request — DB-01', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    await submit(base, await login(base, 'requester'), { ...VALID, categoryId: CAT_SECURITY });
    assert.equal(h.store.requests[0].securityCategory, true);
  });
});

// ---------- access ----------

test('NFR-3.3, AC-FR-1.1: an unauthenticated submission is 401 and stores nothing', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, null);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'UNAUTHENTICATED');
    nothingStored(h);
  });
});

for (const name of ['technician', 'manager', 'security', 'admin']) {
  test(`NFR-3.3, FR-1.3: a ${name} is refused with 403 at the route and nothing is stored`, async () => {
    // Basis: OPERATION_RULES['request:submit'] names Requester and Coordinator only.
    assert.ok(!OPERATION_RULES['request:submit'].includes(USERS.find((u) => u._id === name).roles[0]));
    const h = harness();
    await serve(h.app, async (base) => {
      const res = await submit(base, await login(base, name));
      assert.equal(res.status, 403);
      assert.equal((await res.json()).code, 'FORBIDDEN');
      nothingStored(h);
    });
  });
}

// ---------- DEC-015 §3 ----------

test('DEC-015 §3: a missing Idempotency-Key is 400 and nothing is stored', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'), VALID, { key: null });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
    nothingStored(h);
  });
});

test('DEC-015 §3: the key is stored on the created history entry with its fingerprint', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    await submit(base, await login(base, 'requester'), VALID, { key: 'the-key' });
    assert.equal(h.store.history[0].idempotencyKey, 'the-key');
    assert.match(h.store.history[0].idempotencyFingerprint, /^[0-9a-f]{64}$/);
  });
});

test('DEC-015 §3: a replayed key with the same body returns the same status and body, flags the replay and writes nothing', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const cookie = await login(base, 'requester');
    const first = await submit(base, cookie, VALID, { key: 'replay-me' });
    const firstBody = await first.json();
    const second = await submit(base, cookie, VALID, { key: 'replay-me' });

    assert.equal(second.status, first.status);
    assert.deepEqual(await second.json(), firstBody);
    assert.equal(second.headers.get('idempotent-replayed'), 'true');
    assert.equal(second.headers.get('etag'), '"v1"');
    assert.equal(second.headers.get('location'), first.headers.get('location'));
    assert.equal(h.store.requests.length, 1, 'no second request');
    assert.equal(h.store.history.length, 1, 'no second history entry');
    assert.equal(h.store.counters.get('request-ref:campus-1:2026'), 1, 'no second number consumed');
  });
});

test('DEC-015 §3: the same key with a different body is 422 and writes nothing more', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const cookie = await login(base, 'requester');
    await submit(base, cookie, VALID, { key: 'k' });
    const res = await submit(base, cookie, { ...VALID, location: 'Somewhere else' }, { key: 'k' });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(h.store.requests.length, 1);
    assert.equal(h.store.history.length, 1);
  });
});

// ---------- DEC-016 ----------

test('DEC-016, FR-2.6: category read, number, request insert and history append all use the unit of work\'s session', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    await submit(base, await login(base, 'requester'));
    assert.equal(h.calls.sessions.uow.length, 1, 'exactly one unit of work');
    const [session] = h.calls.sessions.uow;
    assert.ok(session, 'a session exists');
    assert.equal(h.calls.sessions.category[0], session, 'category read joins the transaction');
    assert.equal(h.calls.sessions.counter[0], session, 'the counter increment joins the transaction');
    assert.equal(h.calls.sessions.create[0], session, 'the request insert joins the transaction');
    assert.equal(h.calls.sessions.append[0], session, 'the history append joins the transaction');
  });
});

test('DEC-016, FR-2.6: when the history append fails, no request is stored and no number is consumed', async () => {
  const h = harness({ failHistoryAppend: true });
  await serve(h.app, async (base) => {
    const res = await submit(base, await login(base, 'requester'));
    assert.equal(res.status, 500);
    assert.equal(h.store.requests.length, 0);
    assert.equal(h.store.history.length, 0);
    assert.equal(h.store.counters.size, 0);
  });
});

// ---------- GET /categories (Addendum A1) ----------

test('Addendum A1: the list holds the active categories of the actor\'s campus as { id, code, name, isSecurity } — FR-2.3, FR-9.1', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await fetch(`${base}/api/v1/categories`, { headers: { cookie: await login(base, 'requester') } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { id: CAT_ACTIVE,   code: 'POTHOLE', name: 'Pothole', isSecurity: false },
      { id: CAT_SECURITY, code: 'THREAT',  name: 'Threat',  isSecurity: true },
    ]);
  });
});

test('Addendum A1: every FR-1.2 role may list categories, and the rule equals request:read', async () => {
  assert.deepEqual([...OPERATION_RULES['category:list']].sort(), Object.values(ROLE).sort());
  assert.deepEqual(OPERATION_RULES['category:list'], OPERATION_RULES['request:read']);
  const h = harness();
  await serve(h.app, async (base) => {
    for (const u of USERS) {
      const res = await fetch(`${base}/api/v1/categories`, { headers: { cookie: await login(base, u._id) } });
      assert.equal(res.status, 200, `${u.roles[0]} must be allowed`);
    }
  });
});

test('Addendum A1, NFR-3.3: the category list without a session is 401', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await fetch(`${base}/api/v1/categories`);
    assert.equal(res.status, 401);
  });
});

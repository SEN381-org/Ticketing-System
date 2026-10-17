/**
 * GET /api/v1/reports/summary — the management view (DEC-015 Addendum A, A6).
 *
 * Traces to: AC-FR-8.1, AC-FR-8.2, AC-FR-8.3, AC-FR-8.4, AC-FR-8.5, AC-FR-8.6,
 *            AC-FR-9.2, FR-1.3, DEC-012, DEC-015 Addendum A.
 *
 * Basis: the Then clauses of the acceptance criteria named in each title, the
 * FR-6.1 status set (imported, never retyped), and DEC-015 Addendum A for the
 * status codes. Expected values are derived below from the seed data, by hand,
 * before the code runs.
 *
 * Seed (hours before NOW; category target T in hours):
 *   r1 ROADS    (T=48)  Received     72   open, 72 > 48          -> overdue
 *   r2 ROADS            In Progress  24   open, 24 < 48          -> not overdue
 *   r3 ROADS            Closed      200   terminal               -> not overdue
 *   r4 LIGHTS   (none)  Assigned    500   no target              -> not overdue
 *   r5 SECURITY (T=24)  Received     30   open, 30 > 24, security -> overdue
 *   r6 OLD (inactive, none) Resolved 10   no target
 *   r7 ROADS            On Hold      48   open, 48 = T, not > T  -> not overdue
 *   r8 SECURITY         Closed        5   terminal
 * By status: Received 2, Assigned 1, In Progress 1, On Hold 1, Resolved 1,
 * Closed 2, Rejected 0; total 8. By category: ROADS 4, LIGHTS 1, SECURITY 2, OLD 1.
 *
 * What this does NOT show: that the MongoDB aggregation returns the same rows the
 * in-memory store does. The repository's match document is tested separately and
 * the aggregation is not run against a database here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, ROLE, TERMINAL_STATUSES } from '../src/models/_shared.js';
import { buildMatch } from '../src/repositories/reportRepository.js';
import {
  CAT, HOUR, NOW, harness, makeRequest, serve, login, send, getJson,
} from './managementHarness.js';

const SEED = [
  { categoryId: CAT.roads, status: STATUS.RECEIVED, hoursAgo: 72 },
  { categoryId: CAT.roads, status: STATUS.IN_PROGRESS, hoursAgo: 24 },
  { categoryId: CAT.roads, status: STATUS.CLOSED, hoursAgo: 200 },
  { categoryId: CAT.lights, status: STATUS.ASSIGNED, hoursAgo: 500 },
  { categoryId: CAT.security, status: STATUS.RECEIVED, hoursAgo: 30, security: true },
  { categoryId: CAT.old, status: STATUS.RESOLVED, hoursAgo: 10 },
  { categoryId: CAT.roads, status: STATUS.ON_HOLD, hoursAgo: 48 },
  { categoryId: CAT.security, status: STATUS.CLOSED, hoursAgo: 5, security: true },
].map(makeRequest);

const seeded = () => harness({ requests: SEED.map((r) => ({ ...r })) });
const SUMMARY = '/reports/summary';
const iso = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
const countFor = (body, categoryId) => body.byCategory.find((c) => c.categoryId === categoryId)?.count;

test('AC-FR-8.1: a count for every FR-6.1 status, and the counts sum to the total — Manager', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const res = await getJson(base, SUMMARY, await login(base, 'mgr@example.test'));
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(Object.keys(body.byStatus).sort(), Object.values(STATUS).sort(),
      'every one of the seven FR-6.1 statuses has a count, zero included');
    assert.deepEqual(body.byStatus, {
      [STATUS.RECEIVED]: 2, [STATUS.ASSIGNED]: 1, [STATUS.IN_PROGRESS]: 1, [STATUS.ON_HOLD]: 1,
      [STATUS.RESOLVED]: 1, [STATUS.CLOSED]: 2, [STATUS.REJECTED]: 0,
    });
    assert.equal(body.total, SEED.length);
    assert.equal(Object.values(body.byStatus).reduce((a, b) => a + b, 0), body.total);
  });
});

test('AC-FR-8.2: a count for each category — Manager', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const body = await (await getJson(base, SUMMARY, await login(base, 'mgr@example.test'))).json();
    assert.equal(countFor(body, CAT.roads), 4);
    assert.equal(countFor(body, CAT.lights), 1);
    assert.equal(countFor(body, CAT.security), 2);
    assert.equal(countFor(body, CAT.old), 1);
    assert.equal(body.byCategory.reduce((a, c) => a + c.count, 0), body.total);
  });
});

test('AC-FR-8.3: the request open longer than T is overdue and the one open less than T is not', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const body = await (await getJson(base, SUMMARY, await login(base, 'mgr@example.test'))).json();
    const ids = body.overdue.requests.map((r) => r.reference).sort();
    assert.deepEqual(ids, [SEED[0].reference, SEED[4].reference].sort(),
      'r1 (72h > 48h) and r5 (30h > 24h) only');
    assert.equal(body.overdue.count, 2);
    assert.ok(!ids.includes(SEED[1].reference), 'r2 (24h < 48h) is not overdue');
    assert.ok(!ids.includes(SEED[6].reference), 'r7 (exactly 48h) does not exceed T');
    assert.ok(!ids.includes(SEED[2].reference), 'r3 is terminal');
    assert.ok(!ids.includes(SEED[3].reference), 'r4 has no target');
    for (const status of TERMINAL_STATUSES) {
      assert.ok(body.overdue.requests.every((r) => r.status !== status));
    }
  });
});

test('AC-FR-8.3: a Resolved request past its target is NOT overdue; an On Hold one past its target IS (open ends at Resolved)', async () => {
  // Both on ROADS (T=48), 100h old, so each is past the target; only the status differs.
  const extra = [
    { categoryId: CAT.roads, status: STATUS.RESOLVED, hoursAgo: 100 },
    { categoryId: CAT.roads, status: STATUS.ON_HOLD, hoursAgo: 100 },
  ].map((spec, i) => makeRequest(spec, 100 + i));
  const { app } = harness({ requests: [...SEED, ...extra].map((r) => ({ ...r })) });
  await serve(app, async (base) => {
    const body = await (await getJson(base, SUMMARY, await login(base, 'mgr@example.test'))).json();
    const refs = body.overdue.requests.map((r) => r.reference);
    assert.ok(!refs.includes(extra[0].reference), 'Resolved 100h > 48h is not overdue');
    assert.ok(refs.includes(extra[1].reference), 'On Hold 100h > 48h is overdue');
    assert.ok(body.overdue.requests.every((r) => ![STATUS.RESOLVED, ...TERMINAL_STATUSES].includes(r.status)));
    assert.equal(body.overdue.count, 3, 'r1, r5 and the On Hold request');
  });
});

test('AC-FR-8.4: a Manager sets the target and the overdue calculation then uses it', async () => {
  const { app, store } = seeded();
  await serve(app, async (base) => {
    const cookie = await login(base, 'mgr@example.test');
    const before = await (await getJson(base, SUMMARY, cookie)).json();
    assert.ok(!before.overdue.requests.some((r) => r.reference === SEED[1].reference));

    // r2 has been open 24h. A target of 10h makes it overdue; nothing else changed.
    const put = await send(base, 'PUT', `/categories/${CAT.roads}/target`,
      { cookie, body: { targetResolutionHours: 10 } });
    assert.equal(put.status, 200);
    assert.equal(store.categories.get(CAT.roads).targetResolutionHours, 10, 'the value is stored');

    const after = await (await getJson(base, SUMMARY, cookie)).json();
    const refs = after.overdue.requests.map((r) => r.reference);
    assert.ok(refs.includes(SEED[1].reference), 'r2 (24h > 10h) is now overdue');
    assert.ok(refs.includes(SEED[6].reference), 'r7 (48h > 10h) is now overdue');
  });
});

test('AC-FR-8.5: with a date range and a category together, counts include only requests matching both', async () => {
  const { app, calls } = seeded();
  await serve(app, async (base) => {
    const cookie = await login(base, 'mgr@example.test');
    // ROADS requests submitted 20-100h ago: r1 (72), r2 (24), r7 (48). r3 (200h) is outside the
    // range; r5 (30h, SECURITY) is inside the range but in another category.
    const q = `?from=${encodeURIComponent(iso(100))}&to=${encodeURIComponent(iso(20))}&categoryId=${CAT.roads}`;
    const body = await (await getJson(base, SUMMARY + q, cookie)).json();
    assert.equal(body.total, 3);
    assert.equal(countFor(body, CAT.roads), 3);
    assert.equal(countFor(body, CAT.security), 0);
    assert.deepEqual(body.byStatus, {
      [STATUS.RECEIVED]: 1, [STATUS.ASSIGNED]: 0, [STATUS.IN_PROGRESS]: 1, [STATUS.ON_HOLD]: 1,
      [STATUS.RESOLVED]: 0, [STATUS.CLOSED]: 0, [STATUS.REJECTED]: 0,
    });
    assert.equal(Object.values(body.byStatus).reduce((a, b) => a + b, 0), body.total, 'AC-FR-8.1 holds inside the filter');

    const range = await (await getJson(base, `${SUMMARY}?from=${encodeURIComponent(iso(100))}&to=${encodeURIComponent(iso(20))}`, cookie)).json();
    assert.equal(range.total, 4, 'the date range alone also admits r5 (30h)');
    const cat = await (await getJson(base, `${SUMMARY}?categoryId=${CAT.roads}`, cookie)).json();
    assert.equal(cat.total, 4, 'the category alone also admits r3 (200h)');
    assert.equal(calls.reports.at(-1).categoryId, CAT.roads);
  });
});

test('AC-FR-8.5: a date-only "to" includes that whole day (UTC)', async () => {
  const { app, calls } = seeded();
  await serve(app, async (base) => {
    const res = await getJson(base, `${SUMMARY}?from=2026-10-01&to=2026-10-17`, await login(base, 'mgr@example.test'));
    assert.equal(res.status, 200);
    assert.equal(calls.reports.at(-1).to.toISOString(), '2026-10-17T23:59:59.999Z');
    assert.equal(calls.reports.at(-1).from.toISOString(), '2026-10-01T00:00:00.000Z');
  });
});

test('AC-FR-8.5: the repository match is the conjunction of the date range and the category', () => {
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-10-02T00:00:00Z');
  const match = buildMatch({ campusId: 'c0000000000000000000000a', from, to, categoryId: CAT.roads });
  assert.equal(String(match.categoryId), CAT.roads);
  assert.deepEqual(match.submittedAt, { $gte: from, $lte: to });
  assert.deepEqual(Object.keys(buildMatch({ campusId: 'c0000000000000000000000a' })), ['campusId'],
    'no filter adds no condition');
});

// Basis: AC-FR-8.6 "Given request data containing security-category requests, when a Manager without
// the Security Officer role opens the management view, then those requests are included in the
// status and category counts, and their description, comments and actions are not reachable".
// Why: the seed documents carry SECRET-* text in description, location, comments and actions, and the
// fake repository hands whole documents to the service, so only the service stops a leak.
// Expected, before running: security requests r5 (Received) and r8 (Closed) are counted; the body
// contains no SECRET marker and no description/comments/actions/location key anywhere.
// Shows: the response of the real route is free of request detail for a Manager. Does NOT show:
// that the real repository's .select() keeps detail out (the service no longer relies on it).
test('AC-FR-8.6: security requests are counted for a Manager, and no description, comment or action is in the response', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const cookie = await login(base, 'mgr@example.test');
    const res = await getJson(base, SUMMARY, cookie);
    const text = await res.text();
    const body = JSON.parse(text);

    assert.equal(countFor(body, CAT.security), 2, 'both security requests are in the category count');
    assert.equal(body.byStatus[STATUS.RECEIVED], 2, 'the security Received request is in the status count');
    assert.equal(body.byStatus[STATUS.CLOSED], 2, 'the security Closed request is in the status count');
    assert.ok(body.overdue.requests.some((r) => r.reference === SEED[4].reference), 'and may be overdue');

    assert.doesNotMatch(text, /SECRET/);
    assert.doesNotMatch(text, /"(description|comments?|actions?|location)"/);
    const keys = new Set();
    (function walk(v) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    })(body);
    for (const forbidden of ['description', 'comments', 'comment', 'actions', 'action', 'location']) {
      assert.ok(!keys.has(forbidden), `'${forbidden}' appears in the response`);
    }
  });
});

test('AC-FR-9.2: a deactivated category keeps its requests in the category counts', async () => {
  const { app, store } = seeded();
  await serve(app, async (base) => {
    const admin = await login(base, 'admin@example.test');
    const mgr = await login(base, 'mgr@example.test');
    const before = await (await getJson(base, SUMMARY, mgr)).json();
    assert.equal(countFor(before, CAT.roads), 4);

    const res = await send(base, 'POST', `/categories/${CAT.roads}/deactivation`, { cookie: admin });
    assert.equal(res.status, 201);
    assert.equal(store.categories.get(CAT.roads).active, false);

    const after = await (await getJson(base, SUMMARY, mgr)).json();
    assert.equal(countFor(after, CAT.roads), 4, 'the four ROADS requests still count');
    assert.equal(after.byCategory.find((c) => c.categoryId === CAT.roads).active, false);
    assert.equal(after.total, before.total);
    assert.equal(countFor(after, CAT.old), 1, 'a category that was already inactive is also listed');
  });
});

test('A6: 400 for a bad date, from later than to, a malformed categoryId, and an unknown parameter — DEC-015 Addendum A', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const cookie = await login(base, 'mgr@example.test');
    for (const q of ['?from=yesterday', '?to=2026-02-31', '?from=2026-10-02&to=2026-10-01',
      '?categoryId=not-an-id', '?categoryId=123', '?status=Closed']) {
      const res = await getJson(base, SUMMARY + q, cookie);
      assert.equal(res.status, 400, q);
      assert.equal((await res.json()).code, 'INVALID_REQUEST', q);
    }
  });
});

test('A6: 401 without a session, and no summary data in the body — DEC-015 Addendum A', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const res = await getJson(base, SUMMARY, null);
    assert.equal(res.status, 401);
    assert.doesNotMatch(await res.text(), /byStatus|CC-2026/);
  });
});

// Basis: FR-1.3 / OPERATION_RULES 'report:read' = Manager, Coordinator, Security Officer; DEC-012 point 1.
// Expected: Requester, Technician and Administrator get 403 with no summary data; the three permitted roles get 200.
test('A6: report:read is refused (403, no data) to Requester, Technician and Administrator, and allowed to the three roles it names — FR-1.3', async () => {
  const { app } = seeded();
  await serve(app, async (base) => {
    const refused = [['req@example.test', ROLE.REQUESTER], ['tech@example.test', ROLE.TECHNICIAN],
      ['admin@example.test', ROLE.ADMINISTRATOR]];
    for (const [email, role] of refused) {
      const res = await getJson(base, SUMMARY, await login(base, email));
      assert.equal(res.status, 403, role);
      assert.doesNotMatch(await res.text(), /byStatus|CC-2026/, role);
    }
    for (const email of ['mgr@example.test', 'coord@example.test', 'sec@example.test']) {
      assert.equal((await getJson(base, SUMMARY, await login(base, email))).status, 200, email);
    }
  });
});

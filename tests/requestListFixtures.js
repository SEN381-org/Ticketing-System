/**
 * Shared fixtures for tests/requestList.test.js — not itself a test file.
 *
 * Traces to: FR-1.2, FR-3.1, FR-4.1, FR-4.3, FR-4.6, FR-1.5, DEC-012.
 *
 * `fakeLists` stands in for requestListRepository. It applies the Mongo filter the
 * service builds to an in-memory set, using a small evaluator that supports ONLY
 * the operators the service emits ($and, $or, $in, $ne, $lt, $lte, $gt, $gte,
 * equality, and a word-match stand-in for $text) and THROWS on anything else, so a
 * new operator cannot be silently ignored. It returns whole documents, description
 * included, so a test can show the service (not the fake) removes them.
 *
 * What it does NOT show: that MongoDB evaluates the filter the same way. That is
 * the integration suite's job against a real cluster.
 */

import { ROLE, STATUS } from '../src/models/_shared.js';

export const oid = (n) => n.toString(16).padStart(24, '0');

export const CAT1 = oid(0xc1);
export const CAT2 = oid(0xc2);
export const CATS = oid(0xc5);          // a security category (FR-1.5)

export const R1 = oid(0x1001);
export const R2 = oid(0x1002);
export const TA = oid(0x2001);
export const TB = oid(0x2002);

const day = (d, h = 9) => new Date(Date.UTC(2026, 0, d, h));

const doc = (n, over) => ({
  _id: oid(0x3000 + n), reference: `CC-2026-${String(n).padStart(6, '0')}`,
  categoryId: CAT1, securityCategory: false, status: STATUS.RECEIVED,
  requesterId: R1, assigneeId: null, location: `Block ${n}`,
  description: `private detail ${n}`, submittedAt: day(n),
  ...over,
});

/** Chosen so every role, every category and the security flag are exercised. */
export const REQUESTS = Object.freeze([
  doc(1,  { description: 'leaking tap in the hall' }),
  doc(2,  { status: STATUS.ASSIGNED, assigneeId: TA }),
  doc(3,  { categoryId: CAT2, status: STATUS.IN_PROGRESS, assigneeId: TB }),
  doc(4,  { requesterId: R2, description: 'broken streetlight' }),
  doc(5,  { requesterId: R2, categoryId: CAT2, status: STATUS.RESOLVED, assigneeId: TB }),
  doc(6,  { categoryId: CATS, securityCategory: true, status: STATUS.ASSIGNED, description: 'confidential incident' }),
  doc(7,  { requesterId: R2, categoryId: CATS, securityCategory: true, status: STATUS.CLOSED }),
  doc(8,  { status: STATUS.ON_HOLD, assigneeId: TA }),
  doc(9,  { requesterId: R2, categoryId: CAT2 }),
  doc(10, { submittedAt: day(8) }),             // same instant as #8: exercises the _id tie-break
]);

export const actor = (id, roles, categoryAuthorisations = []) => ({ id, roles, categoryAuthorisations });

/** Every FR-1.2 role, and the combinations that decide the branches of mayViewRequest. */
export const ACTORS = Object.freeze({
  requester1:        actor(R1, [ROLE.REQUESTER]),
  requester2:        actor(R2, [ROLE.REQUESTER]),
  technicianCat1:    actor(TA, [ROLE.TECHNICIAN], [CAT1]),
  technicianCat2:    actor(TB, [ROLE.TECHNICIAN], [CAT2]),
  technicianNone:    actor(oid(0x2004), [ROLE.TECHNICIAN], []),
  technicianSecCat:  actor(oid(0x2005), [ROLE.TECHNICIAN], [CATS]),
  coordinatorCat1:   actor(oid(0x2101), [ROLE.COORDINATOR], [CAT1]),
  managerAll:        actor(oid(0x2201), [ROLE.MANAGER], [CAT1, CAT2, CATS]),
  securityOfficer:   actor(oid(0x2301), [ROLE.SECURITY_OFFICER], [CATS]),
  securityOfficerNo: actor(oid(0x2302), [ROLE.SECURITY_OFFICER], []),
  administrator:     actor(oid(0x2401), [ROLE.ADMINISTRATOR], [CAT1, CAT2, CATS]),
  requesterTech:     actor(R1, [ROLE.REQUESTER, ROLE.TECHNICIAN], [CAT2]),
  noRole:            actor(oid(0x2501), [], [CAT1]),
});

// ---------- the in-memory filter evaluator ----------

const same = (a, b) =>
  (a instanceof Date || b instanceof Date) ? new Date(a).getTime() === new Date(b).getTime() : String(a) === String(b);
const order = (a, b) => {
  if (a instanceof Date || b instanceof Date) return new Date(a).getTime() - new Date(b).getTime();
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

function fieldMatches(value, cond) {
  const isOps = cond !== null && typeof cond === 'object' && !(cond instanceof Date)
    && Object.keys(cond).some((k) => k.startsWith('$'));
  if (!isOps) return cond === null ? value == null : value != null && same(value, cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case '$in':  return arg.some((a) => value != null && same(value, a));
      case '$ne':  return !(value != null && same(value, arg));
      case '$lt':  return value != null && order(value, arg) < 0;
      case '$lte': return value != null && order(value, arg) <= 0;
      case '$gt':  return value != null && order(value, arg) > 0;
      case '$gte': return value != null && order(value, arg) >= 0;
      default: throw new Error(`fake evaluator: unsupported operator ${op}`);
    }
  });
}

export function matches(row, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$and') return cond.every((c) => matches(row, c));
    if (key === '$or')  return cond.some((c) => matches(row, c));
    if (key === '$text') {
      const haystack = `${row.description ?? ''} ${row.location ?? ''}`.toLowerCase();
      return cond.$search.toLowerCase().split(/\s+/).some((w) => haystack.includes(w));
    }
    if (key.startsWith('$')) throw new Error(`fake evaluator: unsupported operator ${key}`);
    return fieldMatches(row[key], cond);
  });
}

/** A fake requestListRepository over `rows`; records every call it receives. */
export function fakeLists(rows = REQUESTS) {
  const calls = [];
  return {
    calls,
    findPage: async (filter, sort, limit) => {
      calls.push({ filter, sort, limit });
      return rows.filter((r) => matches(r, filter))
        .sort((a, b) => {
          for (const [field, dir] of sort) {
            const c = order(a[field], b[field]);
            if (c !== 0) return c * dir;
          }
          return 0;
        })
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
  };
}

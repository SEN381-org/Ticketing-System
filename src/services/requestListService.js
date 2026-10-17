/**
 * RequestListService — read side for lists and search.
 *
 * Traces to: FR-3.1, FR-3.2, FR-3.5, FR-3.6, FR-4.1, FR-4.3, FR-4.4, FR-4.5,
 *            FR-4.6, FR-1.5, DEC-012 (points 1 and 2), DEC-014, DEC-015 §1 and §4,
 *            CON-007.
 *
 * Who sees what is NOT decided here. `viewScopeFor` (src/domain/accessRules.js)
 * states the same rule as `mayViewRequest` as data, and `filterForScope` turns
 * that data into the query's authorisation clause. tests/requestList.test.js
 * proves the result equals the fixture filtered by `mayViewRequest`.
 *
 * Open point for the project lead: the "unassigned set" (FR-4.6) is requested as
 * `assigneeId=none`. DEC-015 §1 names the parameter but not this value.
 *
 * Search text is never logged (CON-007). A persistence error is replaced by a
 * generic one before it can reach the error handler's log, because a driver
 * error may echo the query it was given.
 */

import { viewScopeFor, visibleStatusFor, STAFF_ROLES } from '../domain/accessRules.js';
import { AuthorisationError, ValidationError } from '../errors.js';
import { STATUS } from '../models/_shared.js';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const REFERENCE = /^CC-\d{4}-\d{6}$/;
const MAX_TEXT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `sort` parameter value -> [field, direction]. FR-4.5: submission date, status, category. */
const SORTS = Object.freeze({
  '-submittedAt': ['submittedAt', -1],
  'submittedAt':  ['submittedAt', 1],
  'status':       ['status', 1],
  '-status':      ['status', -1],
  'categoryId':   ['categoryId', 1],
  '-categoryId':  ['categoryId', -1],
});
export const DEFAULT_SORT = '-submittedAt';                           // AC-FR-4.5

const LIST_KEYS   = ['status', 'categoryId', 'assigneeId', 'from', 'to', 'sort', 'cursor', 'limit'];
const SEARCH_KEYS = ['text', ...LIST_KEYS];

const bad = (name, why) => new ValidationError(`Parameter '${name}' ${why}`);

function stringParam(source, name) {
  const value = source[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') throw bad(name, 'must be a non-empty string');
  return value;
}

function objectIdParam(source, name) {
  const value = stringParam(source, name);
  if (value !== undefined && !OBJECT_ID.test(value)) throw bad(name, 'is not a valid identifier');
  return value;
}

/** A date, or a date-time with an offset. A date-only `to` includes that whole day. */
function dateParam(source, name) {
  const value = stringParam(source, name);
  if (value === undefined) return undefined;
  if (!DATE.test(value) && !DATE_TIME.test(value)) {
    throw bad(name, 'must be an ISO 8601 date or date-time');
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw bad(name, 'is not a real date');
  return { at, dateOnly: DATE.test(value) };
}

function limitParam(source) {
  const value = source.limit;
  if (value === undefined) return DEFAULT_LIMIT;
  const n = typeof value === 'number' ? value : (/^\d+$/.test(String(value)) ? Number(value) : NaN);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw bad('limit', `must be a whole number from 1 to ${MAX_LIMIT}`);
  }
  return n;
}

/** Cursor = opaque base64url of { s: sort, v: last sort value, i: last _id }. */
function encodeCursor(sort, doc) {
  const [field] = SORTS[sort];
  const raw = doc[field];
  const v = raw instanceof Date ? raw.toISOString() : String(raw);
  return Buffer.from(JSON.stringify({ s: sort, v, i: String(doc._id) })).toString('base64url');
}

function decodeCursor(value, sort) {
  let c;
  try {
    c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw bad('cursor', 'is not valid');
  }
  const [field] = SORTS[sort];
  const okValue =
    field === 'submittedAt' ? (typeof c?.v === 'string' && DATE_TIME.test(c.v) && !Number.isNaN(new Date(c.v).getTime()))
    : field === 'status'    ? Object.values(STATUS).includes(c?.v)
    : typeof c?.v === 'string' && OBJECT_ID.test(c.v);
  if (c?.s !== sort || !okValue || typeof c?.i !== 'string' || !OBJECT_ID.test(c.i)) {
    throw bad('cursor', 'is not valid for this sort');
  }
  return { value: field === 'submittedAt' ? new Date(c.v) : c.v, id: c.i };
}

/**
 * The authorisation clause for a scope. Mirrors mayViewRequest branch by branch:
 * staff see authorised categories, security-category requests only with the
 * Security Officer role (FR-1.5), a requester sees their own (FR-3.6).
 * An authorised-category value that is not an identifier can match no request.
 */
export function filterForScope(scope) {
  if (scope.kind === 'own') return { requesterId: scope.requesterId };
  if (scope.kind === 'staff') {
    const clause = { categoryId: { $in: scope.categoryIds.filter((id) => OBJECT_ID.test(id)) } };
    if (!scope.includeSecurity) clause.securityCategory = false;
    return clause;
  }
  return { _id: { $in: [] } };
}

/**
 * FR-4.4 for a requester: the status they filter by is the status they are
 * shown (FR-3.5), so on a security request it matches every internal status
 * that maps to it. Filtering by internal status would disclose the mapped value.
 */
function statusClause(status, scope, actor) {
  if (scope.kind !== 'own') return { status };
  const internals = Object.values(STATUS).filter((s) => visibleStatusFor(s, true, actor) === status);
  return { $or: [{ securityCategory: false, status }, { securityCategory: true, status: { $in: internals } }] };
}

function parse(source, allowed, scope) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new ValidationError('The request must carry its parameters as an object');
  }
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) throw bad(key, 'is not recognised');
  }

  const status = stringParam(source, 'status');
  if (status !== undefined && !Object.values(STATUS).includes(status)) {
    throw bad('status', `must be one of: ${Object.values(STATUS).join(', ')}`);
  }
  const categoryId = objectIdParam(source, 'categoryId');
  const assigneeId = stringParam(source, 'assigneeId');
  if (assigneeId !== undefined && assigneeId !== 'none' && !OBJECT_ID.test(assigneeId)) {
    throw bad('assigneeId', "must be an identifier, or 'none' for the unassigned set");
  }
  const from = dateParam(source, 'from');
  const to = dateParam(source, 'to');
  if (from && to && from.at.getTime() > to.at.getTime()) throw bad('from', 'is after to');

  const sort = stringParam(source, 'sort') ?? DEFAULT_SORT;
  if (!Object.hasOwn(SORTS, sort)) throw bad('sort', `must be one of: ${Object.keys(SORTS).join(', ')}`);
  // A requester's list is ordered by submission date only: ordering by internal
  // status would reveal the order of statuses FR-3.5 hides from them.
  if (scope.kind === 'own' && SORTS[sort][0] !== 'submittedAt') {
    throw bad('sort', 'may only order by submittedAt for a requester');
  }
  const cursorText = stringParam(source, 'cursor');
  const cursor = cursorText === undefined ? null : decodeCursor(cursorText, sort);
  const limit = limitParam(source);

  return { status, categoryId, assigneeId, from, to, sort, cursor, limit };
}

function buildFilter(q, scope, actor, extra) {
  const clauses = [filterForScope(scope)];
  if (q.status !== undefined) clauses.push(statusClause(q.status, scope, actor));
  if (q.categoryId !== undefined) clauses.push({ categoryId: q.categoryId });
  if (q.assigneeId !== undefined) clauses.push({ assigneeId: q.assigneeId === 'none' ? null : q.assigneeId });
  if (q.from) clauses.push({ submittedAt: { $gte: q.from.at } });
  if (q.to) {
    clauses.push({ submittedAt: q.to.dateOnly
      ? { $lt: new Date(q.to.at.getTime() + DAY_MS) }
      : { $lte: q.to.at } });
  }
  if (q.cursor) {
    const [field, dir] = SORTS[q.sort];
    const op = dir === -1 ? '$lt' : '$gt';
    clauses.push({ $or: [
      { [field]: { [op]: q.cursor.value } },
      { [field]: q.cursor.value, _id: { [op]: q.cursor.id } },
    ] });
  }
  if (extra) clauses.push(extra);
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

export function createRequestListService({ lists }) {
  async function page(q, scope, actor, extra) {
    const [field, dir] = SORTS[q.sort];
    const found = await lists.findPage(buildFilter(q, scope, actor, extra), [[field, dir], ['_id', dir]], q.limit + 1);
    const more = found.length > q.limit;
    const rows = more ? found.slice(0, q.limit) : found;
    return {
      items: rows.map((r) => ({
        id:          String(r._id),
        reference:   r.reference,
        status:      visibleStatusFor(r.status, Boolean(r.securityCategory), actor),   // FR-3.5
        categoryId:  String(r.categoryId),
        location:    r.location ?? null,
        submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt,
        assigneeId:  r.assigneeId == null ? null : String(r.assigneeId),
      })),
      nextCursor: more ? encodeCursor(q.sort, rows[rows.length - 1]) : null,
    };
  }

  /** GET /api/v1/requests — FR-3.1, FR-4.1, FR-4.4, FR-4.5, FR-4.6. */
  async function list(query, actor) {
    const scope = viewScopeFor(actor);
    return page(parse(query, LIST_KEYS, scope), scope, actor);
  }

  /**
   * POST /api/v1/requests/search — FR-4.3. Staff only: the operation is
   * `request:read` (all roles, DEC-012 point 1), so the restriction is made here.
   */
  async function search(body, actor) {
    const roles = actor?.roles ?? [];
    if (!roles.some((r) => STAFF_ROLES.includes(r))) {
      throw new AuthorisationError('Search is available to staff only');
    }
    const scope = viewScopeFor(actor);
    const q = parse(body, SEARCH_KEYS, scope);

    const text = body.text;
    if (typeof text !== 'string' || text.trim() === '') throw bad('text', 'is required');
    if (text.length > MAX_TEXT) throw bad('text', `must be at most ${MAX_TEXT} characters`);
    const term = text.trim();

    // Reference: exact match. Description/location: the declared text index.
    const match = REFERENCE.test(term)
      ? { $or: [{ reference: term }, { $text: { $search: term } }] }
      : { $text: { $search: term } };
    try {
      return await page(q, scope, actor, match);
    } catch {
      throw new Error('Search failed');                              // CON-007: never echo the text
    }
  }

  return { list, search };
}

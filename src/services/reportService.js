/**
 * ReportService — the management view.
 *
 * Traces to: FR-8.1, FR-8.2, FR-8.3, FR-8.5, FR-8.6, AC-FR-8.1, AC-FR-8.2,
 *            AC-FR-8.3, AC-FR-8.5, AC-FR-8.6, AC-FR-9.2, OI-14, DEC-012
 *            (enforcement point 2), DEC-014, DEC-015 Addendum A (A6).
 *
 * Result: { byStatus, byCategory, overdue, total }.
 *
 *   byStatus    a count for every FR-6.1 status, zero included; the counts sum to
 *               `total`, which is the number of requests inside the filter.
 *   byCategory  a count for every category, deactivated ones included (FR-9.2).
 *   overdue     FR-8.3: an open request whose elapsed time since submission
 *               exceeds its category's targetResolutionHours.
 *
 * FR-8.6: security-category requests are counted like any other. The repository
 * returns identifiers, a reference, a category, a status and a time only, so no
 * description, comment or action can appear in the result.
 *
 * "Open" is not defined in the project record. This reading treats a request as
 * open until it reaches a terminal status (Closed, Rejected: TERMINAL_STATUSES),
 * so Resolved and On Hold count as open. It is one constant and is raised as a
 * question for the project lead.
 */

import { mayPerformOperation } from '../domain/accessRules.js';
import { AuthorisationError, ValidationError } from '../errors.js';
import { STATUS, TERMINAL_STATUSES } from '../models/_shared.js';
import { campusOf } from './campusOf.js';

const HOUR_MS = 60 * 60 * 1000;
const QUERY_FIELDS = Object.freeze(['from', 'to', 'categoryId']);
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** FR-8.3 — the statuses in which a request is no longer open. */
export const CLOSED_FOR_OVERDUE = TERMINAL_STATUSES;

/**
 * FR-8.5. A date-only `to` includes that whole day (UTC); a full timestamp is exact.
 * @returns {Date}
 */
function parseDate(value, name, { endOfDay = false } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a date`);
  const dateOnly = DATE_ONLY.test(value);
  const date = dateOnly
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(value);
  const valid = !Number.isNaN(date.getTime())
    && (dateOnly ? date.toISOString().startsWith(value) : /^\d{4}-\d{2}-\d{2}T/.test(value));
  if (!valid) throw new ValidationError(`${name} must be an ISO 8601 date or timestamp`);
  return date;
}

function parseQuery(query = {}) {
  const unknown = Object.keys(query).filter((k) => !QUERY_FIELDS.includes(k));
  if (unknown.length > 0) throw new ValidationError(`Unknown query parameter: ${unknown.join(', ')}`);

  const filter = {};
  if (query.from !== undefined) filter.from = parseDate(query.from, 'from');
  if (query.to !== undefined) filter.to = parseDate(query.to, 'to', { endOfDay: true });
  if (filter.from && filter.to && filter.from > filter.to) {
    throw new ValidationError('from must not be later than to');
  }
  if (query.categoryId !== undefined) {
    if (typeof query.categoryId !== 'string' || !OBJECT_ID.test(query.categoryId)) {
      throw new ValidationError('categoryId must be a 24-character hexadecimal identifier');
    }
    filter.categoryId = query.categoryId;
  }
  return filter;
}

export function createReportService({ reports, categories, users, clock = () => new Date() }) {
  /**
   * @param {object} query  { from?, to?, categoryId? } as received
   * @param {object} actor
   */
  async function summary(query, actor) {
    if (!mayPerformOperation('report:read', actor)) throw new AuthorisationError();   // DEC-012 point 2
    const filter = { ...parseQuery(query), campusId: await campusOf(actor, users) };

    const [rows, open, allCategories] = await Promise.all([
      reports.countByStatusAndCategory(filter),
      reports.findOpen(filter, CLOSED_FOR_OVERDUE),
      categories.listAll(filter.campusId),
    ]);

    const byStatus = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    const perCategory = new Map(allCategories.map((c) => [String(c._id), {
      categoryId: String(c._id), code: c.code, name: c.name, active: c.active !== false, count: 0,
    }]));
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] += row.count;
      total += row.count;
      const key = String(row.categoryId);
      if (!perCategory.has(key)) {
        perCategory.set(key, { categoryId: key, code: null, name: null, active: false, count: 0 });
      }
      perCategory.get(key).count += row.count;
    }

    const now = clock().getTime();
    const target = new Map(allCategories.map((c) => [String(c._id), c.targetResolutionHours ?? null]));
    const late = open.flatMap((r) => {
      const hours = target.get(String(r.categoryId));
      const openMs = now - new Date(r.submittedAt).getTime();
      if (hours == null || openMs <= hours * HOUR_MS) return [];
      return [{
        id: String(r._id), reference: r.reference, categoryId: String(r.categoryId),
        status: r.status, openHours: Math.floor(openMs / HOUR_MS),
      }];
    });

    return {
      byStatus,
      byCategory: [...perCategory.values()],
      overdue: { count: late.length, requests: late },
      total,
    };
  }

  return { summary };
}

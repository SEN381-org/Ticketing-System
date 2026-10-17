/**
 * Persistence access for request lists and search. Traces to: FR-4.1, FR-4.3,
 * FR-4.4, FR-4.5, FR-4.6, FR-3.1, DEC-002, DEC-015 §1, CON-007.
 *
 * Read-only. The projection is fixed here and NEVER includes `description`,
 * comments or actions: a list item cannot carry what the query never selected
 * (FR-1.5; DEC-012 point 3 is not built, so this is the guarantee that holds).
 * `securityCategory` is selected only so the service can pass the status through
 * visibleStatusFor; the service does not return it.
 *
 * Indexes used are the ones declared in src/models/Request.js; none is added.
 */

import Request from '../models/Request.js';

export const LIST_PROJECTION = Object.freeze({
  reference: 1, status: 1, categoryId: 1, location: 1, submittedAt: 1,
  assigneeId: 1, securityCategory: 1,
});

export const requestListRepository = {
  /**
   * @param {object} filter  a Mongo filter built by the service
   * @param {Array<[string, 1|-1]>} sort
   * @param {number} limit
   */
  findPage: (filter, sort, limit) =>
    Request.find(filter).select(LIST_PROJECTION).sort(sort).limit(limit).lean(),
};

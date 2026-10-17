/**
 * History and work-record routes. Every route carries the composed guard. DEC-012.
 *
 * Traces to: FR-3.3, FR-7.1, FR-7.2, FR-7.4, FR-2.4, FR-6.7, AC-FR-6.7, DEC-015 §1 and §3.
 *
 * Mounted on the same base path as the request router (src/app.js `mount()`), so
 * the route table sees them. Append-only (FR-6.7): there is deliberately no PUT,
 * PATCH or DELETE on any path here; tests/requestHistory.test.js asserts it over
 * the whole route table.
 */

import express from 'express';
import crypto from 'node:crypto';
import { requireOperation } from '../middleware/authorise.js';
import { IdempotencyKeyRequiredError, ValidationError } from '../errors.js';

const MAX_KEY_LENGTH = 64;      // requestHistory.idempotencyKey, DB-01 §3.3

/** DEC-015 §3 — fingerprint over method, normalised path and body. */
const fingerprint = (path, body) =>
  crypto.createHash('sha256').update(JSON.stringify({ method: 'POST', path, body: body ?? {} })).digest('hex');

/** Idempotency-Key is required; If-Match is not (DEC-015 §1: appends do not conflict with state). */
function readAppendCommand(req, kind) {
  const key = req.get ? req.get('Idempotency-Key') : req.headers?.['idempotency-key'];
  if (!key || !String(key).trim()) throw new IdempotencyKeyRequiredError();
  const idempotencyKey = String(key).trim();
  if (idempotencyKey.length > MAX_KEY_LENGTH) {
    throw new ValidationError(`Idempotency-Key exceeds ${MAX_KEY_LENGTH} characters`);
  }
  const unknown = Object.keys(req.body ?? {}).filter((k) => k !== 'body');
  if (unknown.length > 0) throw new ValidationError(`Unknown field '${unknown[0]}'`);
  return {
    body: req.body?.body,
    idempotencyKey,
    fingerprint: fingerprint(`/requests/${req.params.id}/${kind}`, req.body),
  };
}

export function createHistoryRouter({ requestHistoryService, workRecordService }) {
  const router = express.Router();

  router.get(
    '/:id/history',
    requireOperation('request:read'),                // enforcement point 1
    async (req, res, next) => {
      try {
        res.status(200).json(await requestHistoryService.listHistory(req.params.id, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  const appendRoute = (kind, operation, method) => router.post(
    `/:id/${kind}`,
    requireOperation(operation),                     // enforcement point 1
    async (req, res, next) => {
      try {
        const result = await workRecordService[method](
          req.params.id, req.actor, readAppendCommand(req, kind));
        // DEC-015 §3: a replay has the original's status code and body, plus the header.
        const { replayed, ...body } = result;
        res.set('ETag', `"v${body.version}"`);
        if (replayed) res.set('Idempotent-Replayed', 'true');
        res.status(201).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  appendRoute('comments', 'request:comment', 'addComment');          // FR-7.1
  appendRoute('actions', 'request:comment', 'addAction');            // FR-7.2
  appendRoute('details', 'request:add-detail', 'addDetail');         // FR-2.4

  return router;
}

export { readAppendCommand };

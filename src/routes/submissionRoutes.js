/**
 * Request submission and the category list. Every route carries the composed guard.
 *
 * Traces to: FR-2.1, FR-2.2, FR-2.3, FR-2.6, NFR-3.3, DEC-012, DEC-015 §1 and
 *            Addendum A1.
 *
 * Two routers, mounted by app.js through mount():
 *   POST /api/v1/requests    submit a request
 *   GET  /api/v1/categories  the active categories of the actor's campus
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';
import { fingerprint } from './requestRoutes.js';
import { IdempotencyKeyRequiredError, ValidationError } from '../errors.js';

export const CATEGORIES_BASE = '/api/v1/categories';
const REQUESTS_BASE = '/api/v1/requests';

/** Model limit on the stored key (RequestHistory.js). */
const MAX_KEY_LENGTH = 64;

/** DEC-015 §3 — required on every state-changing POST. Missing or blank → 400. */
function readIdempotencyKey(req) {
  const key = req.get ? req.get('Idempotency-Key') : req.headers?.['idempotency-key'];
  if (!key || !String(key).trim()) throw new IdempotencyKeyRequiredError();
  const trimmed = String(key).trim();
  if (trimmed.length > MAX_KEY_LENGTH) {
    throw new ValidationError(`Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`);
  }
  return trimmed;
}

export function createSubmissionRouter({ requestSubmissionService }) {
  const router = express.Router();

  router.post(
    '/',
    requireOperation('request:submit'),              // enforcement point 1
    async (req, res, next) => {
      try {
        const idempotencyKey = readIdempotencyKey(req);
        const { result, replayed } = await requestSubmissionService.submit(
          req.actor, req.body, { idempotencyKey, fingerprint: fingerprint(req.body) },
        );
        res.set('Location', `${REQUESTS_BASE}/${result.id}`);
        res.set('ETag', `"v${result.version}"`);
        if (replayed) res.set('Idempotent-Replayed', 'true');   // DEC-015 §3
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export function createCategoryRouter({ categoryService }) {
  const router = express.Router();

  router.get(
    '/',
    requireOperation('category:list'),               // enforcement point 1
    async (req, res, next) => {
      try {
        res.status(200).json(await categoryService.listActive(req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

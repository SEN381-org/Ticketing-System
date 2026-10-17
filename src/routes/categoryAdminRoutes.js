/**
 * Category administration routes — DEC-015 Addendum A, A7 and A8.
 *
 * Traces to: FR-8.4, AC-FR-8.4, FR-9.1, AC-FR-9.1, FR-9.2, NFR-3.3, DEC-012, DEC-015.
 *
 *   PUT  /api/v1/categories/:id/target         set target resolution hours  200
 *   POST /api/v1/categories/:id/deactivation   deactivate  201, a repeat 200
 *
 * Mounted on the same base path as the category list (A1), which is another
 * track's router; the two share no route.
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';
import { parseObjectId, requireIdempotencyKey } from './routeInput.js';

export const CATEGORIES_ADMIN_BASE = '/api/v1/categories';

export function createCategoryAdminRouter({ categoryAdminService }) {
  const router = express.Router();

  router.put(
    '/:id/target',
    requireOperation('category:set-target'),
    async (req, res, next) => {
      try {
        requireIdempotencyKey(req);
        const id = parseObjectId(req.params.id);
        res.status(200).json(await categoryAdminService.setTarget(id, req.body, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:id/deactivation',
    requireOperation('category:administer'),
    async (req, res, next) => {
      try {
        requireIdempotencyKey(req);
        const id = parseObjectId(req.params.id);
        const result = await categoryAdminService.deactivate(id, req.actor);
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

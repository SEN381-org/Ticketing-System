/**
 * User administration routes — DEC-015 Addendum A, A2 to A5.
 *
 * Traces to: FR-1.2, AC-FR-1.2, FR-1.4, AC-FR-1.4, FR-5.1, NFR-3.3, DEC-012, DEC-015.
 *
 *   GET  /api/v1/users                    list (e-mail to an Administrator only)
 *   POST /api/v1/users                    create       201 + Location
 *   PUT  /api/v1/users/:id/roles          amend roles  200
 *   POST /api/v1/users/:id/revocation     revoke       201, a repeat 200
 *
 * Every state-changing route requires an Idempotency-Key (DEC-015 §3).
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';
import { parseObjectId, requireIdempotencyKey } from './routeInput.js';

export const USERS_BASE = '/api/v1/users';

export function createUserRouter({ userAdminService }) {
  const router = express.Router();

  router.get(
    '/',
    requireOperation('user:list'),
    async (req, res, next) => {
      try {
        res.status(200).json(await userAdminService.list(req.query, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/',
    requireOperation('user:administer'),
    async (req, res, next) => {
      try {
        requireIdempotencyKey(req);
        const created = await userAdminService.create(req.body, req.actor);
        res.set('Location', `${USERS_BASE}/${created.id}`);
        res.set('Cache-Control', 'no-store');
        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    '/:id/roles',
    requireOperation('user:administer'),
    async (req, res, next) => {
      try {
        requireIdempotencyKey(req);
        const id = parseObjectId(req.params.id);
        res.status(200).json(await userAdminService.setRoles(id, req.body, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:id/revocation',
    requireOperation('user:administer'),
    async (req, res, next) => {
      try {
        requireIdempotencyKey(req);
        const id = parseObjectId(req.params.id);
        const result = await userAdminService.revoke(id, req.actor);
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

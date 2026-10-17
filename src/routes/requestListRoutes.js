/**
 * Request list and search routes. Every route carries the composed guard. DEC-012.
 *
 * Traces to: FR-1.1, FR-3.1, FR-4.1, FR-4.3, FR-4.4, FR-4.5, FR-4.6, NFR-3.3,
 *            CON-007, DEC-015 §1.
 *
 * Mounted at the same base as the request router, ahead of it. Search is a POST
 * with a body so the text never appears in a URL, and therefore in a proxy or
 * server log (DEC-015 §1, CON-007).
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';

export function createRequestListRouter({ requestListService }) {
  const router = express.Router();

  router.get(
    '/',
    requireOperation('request:read'),                // enforcement point 1
    async (req, res, next) => {
      try {
        res.status(200).json(await requestListService.list(req.query, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/search',
    requireOperation('request:read'),                // enforcement point 1; staff only in the service
    async (req, res, next) => {
      try {
        res.status(200).json(await requestListService.search(req.body, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

/**
 * Request routes. Every non-public route carries the composed guard. DEC-012.
 *
 * Traces to: FR-6.2, FR-6.4, NFR-3.3, CON-019.
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';

export function createRequestRouter({ statusTransitionService }) {
  const router = express.Router();

  router.patch(
    '/:id/status',
    requireOperation('request:transition'),   // enforcement point 1
    async (req, res, next) => {
      try {
        const result = await statusTransitionService.transition(
          req.params.id,
          req.body.status,
          req.actor,
          { note: req.body.note },
        );
        res.status(200).json(result);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        return next(error);
      }
    },
  );

  return router;
}

/**
 * Health route — NFR-1.6, AC-NFR-1.6, DEC-015 (503 on database failure), DEC-003
 * (the deploy script's post-restart check). Public: see PUBLIC_ROUTES.
 */

import express from 'express';

export const HEALTH_PATH = '/api/v1/health';

export function createHealthRouter({ healthService }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const status = await healthService.check();
      res.set('Cache-Control', 'no-store');
      res.status(status.database === 'up' ? 200 : 503).json(status);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

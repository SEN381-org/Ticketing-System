/**
 * Management view route — DEC-015 Addendum A, A6.
 *
 * Traces to: FR-8.1, FR-8.2, FR-8.3, FR-8.5, FR-8.6, NFR-3.3, DEC-012.
 *
 *   GET /api/v1/reports/summary?from=&to=&categoryId=
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';

export const REPORTS_BASE = '/api/v1/reports';

export function createReportRouter({ reportService }) {
  const router = express.Router();

  router.get(
    '/summary',
    requireOperation('report:read'),                 // enforcement point 1
    async (req, res, next) => {
      try {
        res.status(200).json(await reportService.summary(req.query, req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

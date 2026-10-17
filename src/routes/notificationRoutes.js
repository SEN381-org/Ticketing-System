/**
 * Notification routes. Every route carries the composed guard. DEC-012.
 *
 * Traces to: FR-3.4, FR-3.5, DEC-015 §1.
 */

import express from 'express';
import { requireOperation } from '../middleware/authorise.js';

export function createNotificationRouter({ notificationService }) {
  const router = express.Router();

  router.get(
    '/',
    requireOperation('notification:list'),           // enforcement point 1
    async (req, res, next) => {
      try {
        res.status(200).json(await notificationService.listForActor(req.actor));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export const NOTIFICATIONS_BASE = '/api/v1/me/notifications';

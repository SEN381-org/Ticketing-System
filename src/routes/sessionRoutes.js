/**
 * Session routes — DEC-018 §5, DEC-015 resource style.
 *
 * Traces to: FR-1.1, FR-1.4, NFR-1.4, NFR-3.4, CON-019.
 *
 *   POST   /api/v1/sessions          log in   → 201 + Set-Cookie
 *   DELETE /api/v1/sessions/current  log out  → 204, always
 *
 * Both are listed, with reasons, in PUBLIC_ROUTES.
 */

import express from 'express';
import { readSessionCookie, setSessionCookie, clearSessionCookie } from '../middleware/session.js';

export const SESSIONS_BASE = '/api/v1/sessions';

export function createSessionRouter({ authService }) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const { token, user } = await authService.login(req.body);
      setSessionCookie(res, token);
      res.set('Cache-Control', 'no-store');
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/current', async (req, res, next) => {
    try {
      await authService.logout(readSessionCookie(req));
      clearSessionCookie(res);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

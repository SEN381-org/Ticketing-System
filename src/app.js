/**
 * The Express application — DEC-014, DEC-015, DEC-012, DEC-018.
 *
 * `createApp(deps)` is pure: it neither connects nor listens. Tests build it with
 * fakes and drive it over real HTTP, so the middleware order and the route table
 * under test are the ones production runs.
 *
 * Order is load-bearing:
 *   1. health        before the session middleware, so a database outage cannot
 *                    turn the health check into a 500 via a cookie lookup
 *   2. body          JSON-only on writes (415), strict parse, 32 kB, mapped errors
 *   3. session       resolves `req.actor`; never rejects (DEC-018 §4)
 *   4. routers       guarded routes refuse inside the guard (DEC-012)
 *   5. 404, then the RFC 9457 error handler, which every error leaves through
 *
 * Every router is mounted through `mount()`, which records the mount path. The
 * whole-application route-table test reads that record, so a router mounted any
 * other way would be invisible to the guard assertion. Do not call `app.use`
 * with a router directly.
 */

import express from 'express';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createSessionMiddleware } from './middleware/session.js';
import { requireJsonOnWrites, parseJsonBody, mapBodyErrors } from './middleware/requestBody.js';
import { createHealthRouter, HEALTH_PATH } from './routes/healthRoutes.js';
import { createSessionRouter, SESSIONS_BASE } from './routes/sessionRoutes.js';
import { createRequestRouter, API_BASE as REQUESTS_BASE } from './routes/requestRoutes.js';
import { createSubmissionRouter, createCategoryRouter, CATEGORIES_BASE } from './routes/submissionRoutes.js';
import { RouteNotFoundError } from './errors.js';

function mount(app, path, router) {
  app.locals.mounts.push({ path, router });
  app.use(path, router);
}

export function createApp({
  authService, healthService, statusTransitionService, requestQueryService,
  requestSubmissionService, categoryService, log = console,
}) {
  const app = express();
  app.locals.mounts = [];

  app.disable('x-powered-by');
  // DEC-003 v0.2: Nginx on the same host terminates TLS. Trust only it.
  app.set('trust proxy', 'loopback');

  mount(app, HEALTH_PATH, createHealthRouter({ healthService }));

  app.use(requireJsonOnWrites, parseJsonBody, mapBodyErrors);
  app.use('/api', createSessionMiddleware({ authService }));

  mount(app, SESSIONS_BASE, createSessionRouter({ authService }));
  mount(app, REQUESTS_BASE, createRequestRouter({ statusTransitionService, requestQueryService }));
  mount(app, REQUESTS_BASE, createSubmissionRouter({ requestSubmissionService }));
  mount(app, CATEGORIES_BASE, createCategoryRouter({ categoryService }));

  app.use((req, res, next) => next(new RouteNotFoundError()));
  app.use(createErrorHandler({ log }));

  return app;
}

/**
 * The full route table: every route in every mounted router, with its full
 * path. Read by tests/authorisationGuard.test.js.
 */
export function routeTable(app) {
  return app.locals.mounts.flatMap(({ path, router }) =>
    router.stack.filter((layer) => layer.route).flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => ({
        method:   method.toUpperCase(),
        path:     layer.route.path === '/' ? path : `${path}${layer.route.path}`,
        handlers: layer.route.stack.map((h) => h.handle),
      }))));
}

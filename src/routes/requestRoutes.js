/**
 * Request routes. Every non-public route carries the composed guard. DEC-012.
 *
 * Traces to: FR-6.2, FR-6.4, NFR-3.3, CON-019, DEC-015, DEC-016.
 *
 * Review comment R-03. The transition was previously modelled as a field update,
 * `PATCH /:id/status`. DEC-015 records it as a resource in its own right:
 *
 *   POST /api/v1/requests/:id/transitions
 *
 * with `If-Match` carrying the ETag (optimistic concurrency, 412/428) and
 * `Idempotency-Key` making a client retry safe. Without the key, a retry after a
 * timeout writes a second immutable history entry, which cannot be removed —
 * `requestHistory` is append-only, so a duplicate is permanent.
 *
 * The guard moves with the route, so the route-table assertion is unaffected.
 */

import express from 'express';
import crypto from 'node:crypto';
import { requireOperation } from '../middleware/authorise.js';
import { IdempotencyKeyRequiredError, PreconditionRequiredError } from '../errors.js';

/** DEC-015 — the ETag is a strong validator over the state version. */
const etagFor = (version) => `"v${version}"`;

function versionFromIfMatch(header) {
  if (!header) throw new PreconditionRequiredError();
  const match = /^"v(\d+)"$/.exec(header.trim());
  if (!match) throw new PreconditionRequiredError();
  return Number(match[1]);
}

/** Fingerprint of the command, so a replayed key with a different body is refused. */
const fingerprint = (body) =>
  crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');

/**
 * DEC-015 §3 — Idempotency-Key is REQUIRED on every state-changing POST.
 *
 * Review comment B-3: it was optional. An optional safeguard against duplicate
 * writes is no safeguard, because the client that omits it is exactly the client
 * that retries. `requestHistory` is append-only, so the duplicate entry a retry
 * writes can never be removed — not by an administrator and not by a migration.
 */
function readCommand(req) {
  const ifMatch = req.get ? req.get('If-Match') : req.headers?.['if-match'];
  const key     = req.get ? req.get('Idempotency-Key') : req.headers?.['idempotency-key'];

  if (!key || !String(key).trim()) throw new IdempotencyKeyRequiredError();

  return {
    expectedVersion:   versionFromIfMatch(ifMatch),
    reason:            req.body?.reason ?? null,          // FR-6.6 — DEC-015 field name
    resolutionSummary: req.body?.resolution ?? null,      // FR-6.5 — DEC-015 field name
    idempotencyKey:    String(key).trim(),
    fingerprint:       fingerprint(req.body),
  };
}

export function createRequestRouter({ statusTransitionService }) {
  const router = express.Router();

  router.post(
    '/:id/transitions',
    requireOperation('request:transition'),          // enforcement point 1
    async (req, res, next) => {
      try {
        const result = await statusTransitionService.transition(
          req.params.id,
          req.body.toStatus,
          req.actor,
          readCommand(req),
        );
        res.set('ETag', etagFor(result.version));
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);                                  // RFC 9457 handler, DEC-015
      }
    },
  );

  return router;
}

export { readCommand };
export const API_BASE = '/api/v1/requests';

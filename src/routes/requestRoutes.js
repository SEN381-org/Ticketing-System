/**
 * Request routes. Every non-public route carries the composed guard. DEC-012.
 *
 * Traces to: FR-6.2, FR-6.4, NFR-3.3, CON-019, DEC-014, DEC-015.
 *
 * Review comment R-03. The transition was previously modelled as a field update,
 * `PATCH /:id/status`. DEC-014 records it as a resource in its own right:
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
import { PreconditionRequiredError } from '../errors.js';

/** DEC-014 — the ETag is a strong validator over the state version. */
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
          {
            expectedVersion:  versionFromIfMatch(req.get('If-Match')),
            note:             req.body.note,
            resolutionSummary: req.body.resolutionSummary,
            idempotencyKey:   req.get('Idempotency-Key') ?? null,
            fingerprint:      fingerprint(req.body),
          },
        );
        res.set('ETag', etagFor(result.version));
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);                                  // RFC 9457 handler, DEC-014
      }
    },
  );

  return router;
}

export const API_BASE = '/api/v1/requests';

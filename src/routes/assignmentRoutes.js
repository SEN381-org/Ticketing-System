/**
 * Assignment route - DEC-015 §1: POST /api/v1/requests/{id}/assignments.
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.5, FR-1.3, NFR-3.3, CON-019,
 *            DEC-012, DEC-015, DEC-016.
 *
 * Assign, accept and reassign are one resource with one body, `{ assigneeId }`
 * (DEC-015 §1). The guard admits an actor who may perform either `request:assign`
 * or `request:accept`; the service decides which the body is (see
 * assignmentService.js). `If-Match` and `Idempotency-Key` are required exactly as
 * on /transitions, and are read by the same function.
 *
 * Validation here is at the boundary only: a malformed request id or assignee id
 * is a 400 naming the field, never a 500 from a failed ObjectId cast (DEC-015 §5).
 */

import express from 'express';
import { requireAnyOperation } from '../middleware/authorise.js';
import { ValidationError } from '../errors.js';
import { readCommand } from './requestRoutes.js';

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const etagFor = (version) => `"v${version}"`;

function readBody(body) {
  const keys = Object.keys(body ?? {});
  const unknown = keys.filter((k) => k !== 'assigneeId');
  if (unknown.length > 0) throw new ValidationError(`Unknown field '${unknown[0]}'`);
  if (typeof body?.assigneeId !== 'string' || !OBJECT_ID.test(body.assigneeId)) {
    throw new ValidationError('assigneeId is required and must be a user identifier');
  }
  return body.assigneeId;
}

export function createAssignmentRouter({ assignmentService }) {
  const router = express.Router();

  router.post(
    '/:id/assignments',
    requireAnyOperation(['request:assign', 'request:accept']),   // enforcement point 1
    async (req, res, next) => {
      try {
        if (!OBJECT_ID.test(req.params.id)) throw new ValidationError('Request id is malformed');
        const command = readCommand(req);
        const assigneeId = readBody(req.body);
        const result = await assignmentService.assign(req.params.id, assigneeId, req.actor, command);
        res.set('ETag', etagFor(result.version));
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (error) {
        next(error);                                  // RFC 9457 handler, DEC-015
      }
    },
  );

  return router;
}

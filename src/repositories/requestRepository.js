/**
 * Persistence access for requests. Traces to: FR-6.2, DEC-002, DEC-014, DEC-015.
 *
 * `applyChange` is the ONLY update path (data baseline §3.2). It is conditional
 * on the version and increments it, and it refuses when nothing matched, which
 * is what makes the lost-update race in Assignment 2 §3.4 impossible rather than
 * unlikely. Review comments R-09 and R-13: the previous version issued an
 * unconditional `$set` and ignored the result, so a request deleted or changed
 * between the read and the write produced a history entry for a change that
 * never happened.
 *
 * Every method takes a session so it can join the DEC-015 transaction (R-14).
 */

import Request from '../models/Request.js';
import { PreconditionFailedError } from '../errors.js';

export const requestRepository = {
  findById: (id, { session } = {}) =>
    Request.findById(id).session(session ?? null).lean(),

  applyChange: async (id, expectedVersion, $set, actor, { session } = {}) => {
    const { matchedCount } = await Request.updateOne(
      { _id: id, version: expectedVersion, anonymisedAt: null },
      {
        $set:  { ...$set, lastActorId: actor.id, lastActorRole: actor.role },
        $inc:  { version: 1 },
      },
      { session, runValidators: true },
    );
    if (matchedCount === 0) throw new PreconditionFailedError(id, expectedVersion);
    return { version: expectedVersion + 1 };
  },
};

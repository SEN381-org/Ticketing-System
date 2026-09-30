/**
 * Persistence access for requests. Traces to: FR-6.2, DEC-002, DEC-015, DEC-016.
 *
 * `applyChange` is the ONLY update path (data baseline §3.2). It is conditional
 * on the version and increments it, and it refuses when nothing matched, which
 * is what makes the lost-update race in Assignment 2 §3.4 impossible rather than
 * unlikely. Review comments R-09 and R-13: the previous version issued an
 * unconditional `$set` and ignored the result, so a request deleted or changed
 * between the read and the write produced a history entry for a change that
 * never happened.
 *
 * Every method takes a session so it can join the DEC-016 transaction (R-14).
 */

import Request from '../models/Request.js';
import { PreconditionFailedError } from '../errors.js';
import { primaryRole } from '../domain/accessRules.js';

/**
 * The update document `applyChange` sends. Extracted so the actor stamp can be
 * asserted without a database (review comment B-2): `actor.role` (singular) was
 * always undefined, Mongoose strips undefined keys, and every audit row the
 * Atlas trigger wrote therefore carried `actorRole: null` — the CON-015 /
 * NFR-1.9 attribution was silently absent.
 */
export function buildChangeUpdate($set, actor) {
  return {
    $set: { ...$set, lastActorId: actor.id, lastActorRole: primaryRole(actor) },
    $inc: { version: 1 },
  };
}

export const requestRepository = {
  findById: (id, { session } = {}) =>
    Request.findById(id).session(session ?? null).lean(),

  applyChange: async (id, expectedVersion, $set, actor, { session } = {}) => {
    const { matchedCount } = await Request.updateOne(
      { _id: id, version: expectedVersion, anonymisedAt: null },
      buildChangeUpdate($set, actor),
      { session, runValidators: true },
    );
    if (matchedCount === 0) throw new PreconditionFailedError(id, expectedVersion);
    return { version: expectedVersion + 1 };
  },
};

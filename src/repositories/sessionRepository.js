/**
 * Persistence access for sessions. Traces to: FR-1.1, FR-1.4, NFR-2.7, NFR-3.4, DEC-018.
 *
 * Every lookup is by `_id`, the SHA-256 of the cookie value. The repository never
 * sees the raw identifier. The auth service hashes it before calling in.
 */

import Session from '../models/Session.js';

export const sessionRepository = {
  create: async (session) => {
    await Session.create([session]);
  },

  findById: (id) => Session.findById(id).lean(),

  /** NFR-3.4 — refresh recorded activity. Called at most once per 60 s per session. */
  touch: async (id, at) => {
    await Session.updateOne({ _id: id }, { $set: { lastSeenAt: at } });
  },

  /** @returns the deleted session, or null if there was none (logout is idempotent). */
  remove: (id) => Session.findOneAndDelete({ _id: id }).lean(),
};

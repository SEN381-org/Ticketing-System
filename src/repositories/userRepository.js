/**
 * Persistence access for users. Traces to: FR-1.1, FR-1.2, FR-1.4, NFR-3.1, DEC-018.
 *
 * `passwordHash` is `select: false` on the schema. Only `findForLogin` asks for
 * it, so no other read path can carry a hash into a response or a log.
 */

import User from '../models/User.js';

export const userRepository = {
  /** FR-1.1 — email is unique and stored lower-cased (schema `lowercase: true`). */
  findForLogin: (email) =>
    User.findOne({ email: String(email).trim().toLowerCase() }).select('+passwordHash').lean(),

  /** Read on every authenticated request, so a role change or revocation applies at the next one. */
  findById: (id) => User.findById(id).lean(),

  /** DEC-018 §2 — re-hash with current parameters after a successful login. */
  updatePasswordHash: async (id, passwordHash) => {
    await User.updateOne({ _id: id }, { $set: { passwordHash } });
  },

  /** Used by scripts/admin/create-user.js only. FR-1.4 administration is not built. */
  create: async (user) => {
    const [created] = await User.create([user]);
    return created.toObject();
  },
};

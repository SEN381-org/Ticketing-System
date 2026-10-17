/**
 * Persistence access for user administration (M4).
 * Traces to: FR-1.2, AC-FR-1.2, FR-1.4, AC-FR-1.4, NFR-3.1, SCP-019,
 *            DEC-015 Addendum A (A2 to A5), DEC-018.
 *
 * `passwordHash` is `select: false` on the schema and is never asked for here, so
 * no read in this file can carry a hash into a response or a log. Every read and
 * write is campus-scoped.
 */

import User from '../models/User.js';
import { ConflictError, ValidationError } from '../errors.js';

const DUPLICATE_KEY = 11000;

/**
 * The model's own validator decides whether the roles are acceptable (AC-FR-1.2:
 * "A role is required"; the enum is the FR-1.2 set). Runs without a database.
 */
export function validateRoles(roles) {
  const error = new User({ roles }).validateSync(['roles']);
  if (!error) return;
  const messages = Object.values(error.errors).map((e) => e.message);
  throw new ValidationError(messages[0]);
}

/** FR-1.4: revoking ends access and, through the epoch, every existing session. */
export function buildRevocationUpdate(revokedAt) {
  return { $set: { status: 'revoked', revokedAt }, $inc: { sessionEpoch: 1 } };
}

const isDuplicateKey = (error) => error?.code === DUPLICATE_KEY;

export const userAdminRepository = {
  /** FR-5.1, FR-1.4: active accounts only. `categoryId` filters on FR-4.6 authorisations. */
  list: ({ campusId, role, categoryId }) => {
    const query = { campusId, status: 'active' };
    if (role) query.roles = role;
    if (categoryId) query.categoryAuthorisations = categoryId;
    return User.find(query).select('displayName email roles').sort({ displayName: 1 }).lean();
  },

  findById: (id, campusId) =>
    User.findOne({ _id: id, campusId }).select('displayName email roles status revokedAt').lean(),

  /** FR-1.1: e-mail is unique and stored lower-cased. */
  findByEmail: (email, campusId) =>
    User.findOne({ campusId, email: String(email).trim().toLowerCase() }).select('_id').lean(),

  create: async (user) => {
    try {
      const [created] = await User.create([user]);
      const { _id, email, displayName, roles } = created.toObject();
      return { _id, email, displayName, roles };
    } catch (error) {
      if (isDuplicateKey(error)) throw new ConflictError('An account with that e-mail already exists');
      throw error;
    }
  },

  setRoles: async (id, campusId, roles) => {
    const { matchedCount } = await User.updateOne({ _id: id, campusId }, { $set: { roles } });
    return matchedCount > 0;
  },

  /** Conditional on `active`, so a repeat matches nothing and does not advance the epoch twice. */
  revoke: async (id, campusId, revokedAt) => {
    const { modifiedCount } = await User.updateOne(
      { _id: id, campusId, status: 'active' }, buildRevocationUpdate(revokedAt));
    return modifiedCount > 0;
  },
};

/**
 * UserAdminService — user listing and administration.
 *
 * Traces to: FR-1.2, AC-FR-1.2, FR-1.4, AC-FR-1.4, FR-5.1, NFR-3.1, CON-007,
 *            DEC-012 (enforcement point 2), DEC-014, DEC-015 Addendum A (A2 to A5),
 *            DEC-018.
 *
 * The initial password is supplied by the Administrator in the request body. It is
 * hashed by src/infrastructure/passwordHasher.js (DEC-018 §2 scrypt parameters)
 * before anything is stored, and it is never logged, returned or kept: only the
 * encoded hash reaches the repository (NFR-3.1). It is refused if empty, as the
 * host script refuses it.
 *
 * Revocation sets status `revoked`, `revokedAt`, and increments `sessionEpoch`.
 * authService.resolve() then returns null for every session of the account
 * (DEC-018 §3), which is how existing sessions end (AC-FR-1.4).
 */

import { mayPerformOperation } from '../domain/accessRules.js';
import { AuthorisationError, ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { ROLE } from '../models/_shared.js';
import { campusOf } from './campusOf.js';

const CREATE_FIELDS = Object.freeze(['email', 'displayName', 'password', 'roles', 'categoryAuthorisations']);
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const notFound = (id) => Object.assign(new NotFoundError(id), { message: `User '${id}' does not exist` });

function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('The body must be a JSON object');
  }
}

function rejectUnknown(body, allowed) {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) throw new ValidationError(`Unknown field: ${unknown.join(', ')}`);
}

function requireString(body, field) {
  const v = body[field];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    throw new ValidationError(`${field} is required`);
  }
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string`);
  return v.trim();
}

/**
 * The initial password follows scripts/admin/create-user.js and DEC-018 §2: a
 * string, refused if empty, and used exactly as given (it is not trimmed, because
 * the person will type it at login). There is no other policy in the records.
 */
function requirePassword(body) {
  const v = body.password;
  if (v === undefined || v === null || v === '') throw new ValidationError('password is required');
  if (typeof v !== 'string') throw new ValidationError('password must be a string');
  return v;
}

export function createUserAdminService({ users, passwords, validateRoles }) {
  const requireAdminister = (actor) => {
    if (!mayPerformOperation('user:administer', actor)) throw new AuthorisationError();
  };

  /** AC-FR-1.2: the model's own validator decides ("A role is required"). */
  function checkRoles(roles) {
    if (roles !== undefined && !Array.isArray(roles)) throw new ValidationError('roles must be a list');
    validateRoles(roles ?? []);
  }

  /** A2. E-mail goes to an Administrator only (CON-007). */
  async function list(query = {}, actor) {
    if (!mayPerformOperation('user:list', actor)) throw new AuthorisationError();
    const unknown = Object.keys(query).filter((k) => !['role', 'categoryId'].includes(k));
    if (unknown.length > 0) throw new ValidationError(`Unknown query parameter: ${unknown.join(', ')}`);

    const { role, categoryId } = query;
    if (role !== undefined && !Object.values(ROLE).includes(role)) {
      throw new ValidationError(`role must be one of: ${Object.values(ROLE).join(', ')}`);
    }
    if (categoryId !== undefined && !OBJECT_ID.test(String(categoryId))) {
      throw new ValidationError('categoryId must be a 24-character hexadecimal identifier');
    }

    const campusId = campusOf(actor);
    const rows = await users.list({ campusId, role, categoryId });
    const showEmail = actor.roles.includes(ROLE.ADMINISTRATOR);
    return rows.map((u) => ({
      id: String(u._id), displayName: u.displayName, roles: [...u.roles],
      ...(showEmail ? { email: u.email } : {}),
    }));
  }

  /** A3. @returns {{id, email, displayName, roles}} */
  async function create(body, actor) {
    requireAdminister(actor);
    requireObject(body);
    rejectUnknown(body, CREATE_FIELDS);

    const email = requireString(body, 'email').toLowerCase();   // FR-1.1: stored lower-cased
    const displayName = requireString(body, 'displayName');
    const password = requirePassword(body);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new ValidationError('email must be an e-mail address');
    if (displayName.length > 100) throw new ValidationError('displayName must be at most 100 characters');
    checkRoles(body.roles);

    const categoryAuthorisations = body.categoryAuthorisations ?? [];
    if (!Array.isArray(categoryAuthorisations)
        || categoryAuthorisations.some((c) => typeof c !== 'string' || !OBJECT_ID.test(c))) {
      throw new ValidationError('categoryAuthorisations must be a list of identifiers');
    }

    const campusId = campusOf(actor);
    if (await users.findByEmail(email, campusId)) {
      throw new ConflictError('An account with that e-mail already exists');
    }

    const created = await users.create({
      campusId, email, displayName, roles: body.roles, categoryAuthorisations,
      passwordHash: await passwords.hash(password),
    });
    return {
      id: String(created._id), email: created.email,
      displayName: created.displayName, roles: [...created.roles],
    };
  }

  /** A4 */
  async function setRoles(userId, body, actor) {
    requireAdminister(actor);
    requireObject(body);
    rejectUnknown(body, ['roles']);
    checkRoles(body.roles);

    const campusId = campusOf(actor);
    if (!(await users.setRoles(userId, campusId, body.roles))) throw notFound(userId);
    return { id: String(userId), roles: [...body.roles] };
  }

  /** A5. @returns {{id, status: 'revoked', revokedAt, replayed: boolean}} */
  async function revoke(userId, actor, now = new Date()) {
    requireAdminister(actor);
    const campusId = campusOf(actor);
    const user = await users.findById(userId, campusId);
    if (!user) throw notFound(userId);

    if (user.status === 'active' && await users.revoke(userId, campusId, now)) {
      return { id: String(userId), status: 'revoked', revokedAt: now, replayed: false };
    }
    // Already revoked, here or by a concurrent request: a replay, nothing changed.
    const current = (await users.findById(userId, campusId)) ?? user;
    return { id: String(userId), status: 'revoked', revokedAt: current.revokedAt ?? null, replayed: true };
  }

  return { list, create, setRoles, revoke };
}

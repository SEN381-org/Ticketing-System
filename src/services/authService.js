/**
 * AuthService — login, logout and per-request session resolution.
 *
 * Traces to: FR-1.1, FR-1.4, AC-FR-1.4, NFR-1.4, NFR-2.7, NFR-3.1, NFR-3.4,
 *            AC-NFR-3.4, CON-019, DEC-012, DEC-017, DEC-018.
 *
 * DEC-018 decides what this file implements. Three properties carry the weight:
 *
 *   1. One failure. An unknown email, a wrong password and a revoked account all
 *      raise the same AuthenticationError, and an unknown email still pays for a
 *      hash, so neither the response nor its timing says which accounts exist.
 *   2. Resolution, not rejection. `resolve()` returns an actor or null. It never
 *      throws for a bad session: the guard (DEC-012) is the only place that
 *      decides 401 or 403.
 *   3. Nothing cached. `resolve()` reads the session and the user on every
 *      request. Revocation (epoch), role changes and group changes therefore apply
 *      at the next request, and no session state lives in this process (NFR-2.7).
 *
 * Collaborators are injected, including the clock and the token source, so the
 * idle boundary and the epoch rule are verifiable without a database.
 */

import { createHash, randomBytes } from 'node:crypto';
import { AuthenticationError, ValidationError } from '../errors.js';
import { primaryRole } from '../domain/accessRules.js';

/** NFR-3.4 — refused once this much time has passed since `lastSeenAt`. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** DEC-018 §3 — `lastSeenAt` is refreshed at most this often (RSK-019 write budget). */
export const REFRESH_INTERVAL_MS = 60 * 1000;

/** 32 random bytes, base64url without padding: always 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const LOGIN_FIELDS = Object.freeze(['email', 'password']);

/** The single failure every login error becomes. Its text is deliberately uninformative. */
const loginRefused = () => new AuthenticationError('The credentials were not accepted');

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

const defaultToken = () => randomBytes(32).toString('base64url');

function validateLoginBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('The body must be a JSON object with email and password');
  }
  // DEC-015 §5 — unknown fields are rejected, and the message names them.
  const unknown = Object.keys(body).filter((k) => !LOGIN_FIELDS.includes(k));
  if (unknown.length > 0) throw new ValidationError(`Unknown field: ${unknown.join(', ')}`);
  for (const field of LOGIN_FIELDS) {
    if (typeof body[field] !== 'string') throw new ValidationError(`${field} must be a string`);
  }
  return { email: body.email, password: body.password };
}

export function createAuthService({
  users, sessions, audit, passwords,
  clock = () => new Date(),
  newToken = defaultToken,
}) {
  let dummyHash = null;

  /** A real hash to verify against when the email is unknown, so that path costs the same. */
  async function costOfAHash(password) {
    dummyHash ??= await passwords.hash(defaultToken());
    await passwords.verify(password, dummyHash);
  }

  async function recordFailure(user, occurredAt) {
    await audit.recordSecurityEvent({
      origin: 'auth', eventType: 'auth.login.failure', outcome: 'failure', occurredAt,
      actorSource: 'unattributed',
      campusId:       user?.campusId ?? null,
      collectionName: user ? 'users' : null,
      documentId:     user?._id ?? null,
    });
  }

  /**
   * @param {object} body the parsed request body
   * @returns {Promise<{token: string, user: {id: string, displayName: string, roles: string[]}}>}
   */
  async function login(body) {
    const { email, password } = validateLoginBody(body);
    const occurredAt = clock();

    const user = await users.findForLogin(email);
    if (!user) {
      await costOfAHash(password);
      await recordFailure(null, occurredAt);
      throw loginRefused();
    }

    // The hash is checked even for a revoked account, so revocation is not
    // distinguishable by timing either.
    const verdict = await passwords.verify(password, user.passwordHash);
    if (!verdict.ok || user.status !== 'active') {
      await recordFailure(user, occurredAt);
      throw loginRefused();
    }

    if (verdict.needsRehash) {
      await users.updatePasswordHash(user._id, await passwords.hash(password));
    }

    // Recorded before the session exists. If the audit write fails, no session
    // is created: NFR-1.4 requires every attempt to be logged, so an unlogged
    // successful login must not be possible.
    await audit.recordSecurityEvent({
      origin: 'auth', eventType: 'auth.login.success', outcome: 'success', occurredAt,
      actorSource: 'session', actorId: user._id, actorRole: primaryRole(user),
      campusId: user.campusId,
    });

    // Fixation: a new identifier on every login. A presented one is never adopted.
    const token = newToken();
    await sessions.create({
      _id:          hashToken(token),
      campusId:     user.campusId,
      userId:       user._id,
      sessionEpoch: user.sessionEpoch ?? 0,
      createdAt:    occurredAt,
      lastSeenAt:   occurredAt,
    });

    return {
      token,
      user: { id: String(user._id), displayName: user.displayName, roles: [...user.roles] },
    };
  }

  /**
   * Idempotent. Ends the session named by the token if there is one. The caller
   * is never told whether there was.
   */
  async function logout(token) {
    if (!token || !TOKEN_PATTERN.test(token)) return;
    const ended = await sessions.remove(hashToken(token));
    if (!ended) return;
    await audit.recordSecurityEvent({
      origin: 'auth', eventType: 'auth.logout', outcome: 'success', occurredAt: clock(),
      actorSource: 'session', actorId: ended.userId, campusId: ended.campusId,
    });
  }

  /**
   * @returns {Promise<{id: string, roles: string[], categoryAuthorisations: string[],
   *                    groupIds: string[]} | null>}
   *
   * DEC-018 §3 — a session is valid only if the document exists, it has been idle
   * for less than 30 minutes, the user exists and is active, and the user's
   * epoch equals the session's.
   */
  async function resolve(token) {
    // Malformed values never reach the database.
    if (!token || !TOKEN_PATTERN.test(token)) return null;

    const id = hashToken(token);
    const session = await sessions.findById(id);
    if (!session) return null;

    const now = clock();
    const idle = now.getTime() - new Date(session.lastSeenAt).getTime();
    // NFR-3.4. `lastSeenAt` can only lag the user's real last request, so this
    // refuses between 29 and 30 minutes after it and never after 30.
    if (idle >= IDLE_LIMIT_MS) return null;

    const user = await users.findById(session.userId);
    if (!user) return null;
    if (user.status !== 'active') return null;                         // FR-1.4
    if ((user.sessionEpoch ?? 0) !== session.sessionEpoch) return null; // AC-FR-1.4

    if (idle >= REFRESH_INTERVAL_MS) await sessions.touch(id, now);

    return {
      id:                     String(user._id),
      roles:                  [...user.roles],
      categoryAuthorisations: (user.categoryAuthorisations ?? []).map(String),
      // Carried, not evaluated: the FR-1.6 union is TD-002 (DB-01 §3.7).
      groupIds:               (user.groupIds ?? []).map(String),
      // Additive (DEC-018 §4): the campus every M4 query is scoped by (SCP-019).
      campusId:               user.campusId == null ? undefined : String(user.campusId),
    };
  }

  return { login, logout, resolve };
}

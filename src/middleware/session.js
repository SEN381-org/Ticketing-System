/**
 * Session middleware — the only place `req.actor` is set. DEC-018 §4, DEC-012.
 *
 * Traces to: FR-1.1, FR-1.4, NFR-2.7, NFR-3.4, CON-019, review comment R-06.
 *
 * It resolves and never rejects. A valid session sets `req.actor`. Anything else
 * (no cookie, an unknown, expired or epoch-mismatched session, a revoked user)
 * clears the cookie and leaves `req.actor` undefined. Only the guard decides 401
 * or 403, so public routes need no exemption logic here.
 *
 * The actor comes from the auth service, which reads the server-side store. It
 * is never taken from a header, query parameter or body (R-06). Whatever was on
 * `req.actor` before this middleware ran is discarded.
 */

/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, Path=/ and
 * has no Domain, so a misconfiguration fails visibly instead of being set loosely.
 *
 * Secure means the browser only sends it over HTTPS, and the one exception
 * browsers make for plain HTTP is `localhost`. In development, use
 * http://localhost:<port>. Over a LAN IP (http://192.168.x.x) the browser
 * silently drops the cookie and every request looks unauthenticated.
 */
export const SESSION_COOKIE = '__Host-sid';

export const SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure:   true,
  sameSite: 'lax',
  path:     '/',
});

/** Reads the session cookie without a parser dependency. First occurrence wins. */
export function readSessionCookie(req) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

export const setSessionCookie = (res, token) =>
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

export const clearSessionCookie = (res) =>
  res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);

export function createSessionMiddleware({ authService }) {
  return async function sessionMiddleware(req, res, next) {
    try {
      delete req.actor;
      const token = readSessionCookie(req);
      if (!token) return next();

      const actor = await authService.resolve(token);
      if (actor) req.actor = actor;
      else clearSessionCookie(res);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

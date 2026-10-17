/**
 * Application error types, each carrying the HTTP status DEC-015 assigns it.
 *
 * The error handler (src/middleware/errorHandler.js) maps these to RFC 9457
 * problem details. Anything not listed here becomes a generic 500, so an
 * unexpected error can never leak a stack trace (review comment R-05, CON-019).
 */

export class AppError extends Error {
  /**
   * `extensions` are extra problem-detail members (RFC 9457 §3.2), for example the
   * current ETag on a 412 (DEC-015 §2). They never replace a standard member.
   */
  constructor(message, { status, type, code, extensions = null }) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.type = type;
    this.code = code;
    this.extensions = extensions;
  }
}

export class NotFoundError extends AppError {
  constructor(id) {
    super(`Request '${id}' does not exist`,
      { status: 404, type: 'https://civicconnect.example/problems/not-found', code: 'NOT_FOUND' });
  }
}

export class AuthorisationError extends AppError {
  constructor(message = 'Forbidden') {
    super(message,
      { status: 403, type: 'https://civicconnect.example/problems/forbidden', code: 'FORBIDDEN' });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message,
      { status: 401, type: 'https://civicconnect.example/problems/unauthenticated', code: 'UNAUTHENTICATED' });
  }
}

export class TransitionError extends AppError {
  constructor(message) {
    super(message,
      { status: 422, type: 'https://civicconnect.example/problems/invalid-transition', code: 'INVALID_TRANSITION' });
  }
}

/** DEC-015 — If-Match absent. */
export class PreconditionRequiredError extends AppError {
  constructor() {
    super('If-Match is required on a state-changing request',
      { status: 428, type: 'https://civicconnect.example/problems/precondition-required', code: 'PRECONDITION_REQUIRED' });
  }
}

/**
 * DEC-015 / DEC-016 — the version presented is not the current one.
 * DEC-015 §2: the problem body carries the current ETag, so the client can re-read
 * and retry deliberately (DEF-008). It is omitted only when the current version is
 * not known, as when the conditional write itself finds the version moved.
 */
export class PreconditionFailedError extends AppError {
  constructor(id, expectedVersion, currentVersion = null) {
    super(`Request '${id}' is no longer at version ${expectedVersion}`,
      { status: 412, type: 'https://civicconnect.example/problems/precondition-failed', code: 'PRECONDITION_FAILED',
        extensions: Number.isInteger(currentVersion) ? { currentEtag: `"v${currentVersion}"` } : null });
  }
}

/** DEC-015 — a state-changing POST must carry an Idempotency-Key. */
export class IdempotencyKeyRequiredError extends AppError {
  constructor() {
    super('Idempotency-Key is required on a state-changing request',
      { status: 400, type: 'https://civicconnect.example/problems/idempotency-key-required',
        code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
}

/** No route matches. Distinct from NotFoundError, whose message names a request. */
export class RouteNotFoundError extends AppError {
  constructor() {
    super('No resource exists at this address',
      { status: 404, type: 'https://civicconnect.example/problems/not-found', code: 'NOT_FOUND' });
  }
}

/** DEC-015 §5 — boundary validation. The message names the offending field. */
export class ValidationError extends AppError {
  constructor(message) {
    super(message,
      { status: 400, type: 'https://civicconnect.example/problems/invalid-request', code: 'INVALID_REQUEST' });
  }
}

/**
 * DEC-015 §5 — a write must be JSON. This is half of the CSRF mitigation: a
 * cross-site HTML form cannot send `application/json`, so refusing anything else
 * closes the form-post route that SameSite=Lax leaves open for top-level POSTs.
 */
export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super('A request with a body must be sent as application/json',
      { status: 415, type: 'https://civicconnect.example/problems/unsupported-media-type',
        code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
}

/** DEC-015 §5 — body over the 32 kB limit. */
export class PayloadTooLargeError extends AppError {
  constructor() {
    super('The request body is too large',
      { status: 413, type: 'https://civicconnect.example/problems/payload-too-large', code: 'PAYLOAD_TOO_LARGE' });
  }
}

/**
 * DEC-015 §3 — same idempotency key, different request (method, path or body).
 * The problem type is the one DEC-015 §3 names, idempotency-key-reused (DEF-010).
 */
export class IdempotencyConflictError extends AppError {
  constructor() {
    super('This Idempotency-Key was used with a different request',
      { status: 422, type: 'https://civicconnect.example/problems/idempotency-key-reused', code: 'IDEMPOTENCY_CONFLICT' });
  }
}

/**
 * DEC-015 §4 row 422 — a domain rule refused an assignment: the request already
 * has an owner (FR-5.3), the named user may not hold it (FR-5.1, FR-5.2), or the
 * request is not in a state that can be assigned.
 */
export class AssignmentRefusedError extends AppError {
  constructor(message) {
    super(message,
      { status: 422, type: 'https://civicconnect.example/problems/assignment-refused', code: 'ASSIGNMENT_REFUSED' });
  }
}

/**
 * Application error types, each carrying the HTTP status DEC-015 assigns it.
 *
 * The error handler (src/middleware/errorHandler.js) maps these to RFC 9457
 * problem details. Anything not listed here becomes a generic 500, so an
 * unexpected error can never leak a stack trace (review comment R-05, CON-019).
 */

export class AppError extends Error {
  constructor(message, { status, type, code }) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.type = type;
    this.code = code;
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

/** DEC-015 / DEC-016 — the version presented is not the current one. */
export class PreconditionFailedError extends AppError {
  constructor(id, expectedVersion) {
    super(`Request '${id}' is no longer at version ${expectedVersion}`,
      { status: 412, type: 'https://civicconnect.example/problems/precondition-failed', code: 'PRECONDITION_FAILED' });
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

/** DEC-015 — same idempotency key, different request body. */
export class IdempotencyConflictError extends AppError {
  constructor() {
    super('This Idempotency-Key was used with a different request',
      { status: 422, type: 'https://civicconnect.example/problems/idempotency-conflict', code: 'IDEMPOTENCY_CONFLICT' });
  }
}

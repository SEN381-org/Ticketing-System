/**
 * Composition root — DEC-014, DEC-016, DEC-011, DEC-018.
 *
 * Builds the real object graph: repositories → unit of work → services → app.
 * It performs no I/O, so a test can compose the production graph without a
 * database and assert what it contains. `src/server.js` adds the connection, the
 * listener and the lifecycle.
 *
 * DEC-011 subscribers are deliberately NOT registered. See Technical Debt
 * Register TD-001: the notification and reportingCounts repositories do not
 * exist yet, and the projection has no reconciliation path (OI-14). A transition
 * still publishes `request.status.changed`; with no listener, that is a no-op.
 * tests/composition.test.js asserts the registry is empty, so registering a
 * subscriber fails that test and forces TD-001 to be updated in the same change.
 */

import './infrastructure/database.js';   // first: sets bufferCommands before any model compiles
import { pingDatabase } from './infrastructure/database.js';
import { passwordHasher } from './infrastructure/passwordHasher.js';
import { createUnitOfWork } from './infrastructure/unitOfWork.js';
import { requestRepository } from './repositories/requestRepository.js';
import { historyRepository } from './repositories/historyRepository.js';
import { sessionRepository } from './repositories/sessionRepository.js';
import { userRepository } from './repositories/userRepository.js';
import { auditRepository } from './repositories/auditRepository.js';
import { createStatusTransitionService } from './services/statusTransitionService.js';
import { createRequestQueryService } from './services/requestQueryService.js';
import { createAuthService } from './services/authService.js';
import { createHealthService } from './services/healthService.js';
import { createApp } from './app.js';

export function composeApplication({ log = console, release = 'unknown' } = {}) {
  const services = {
    authService: createAuthService({
      users: userRepository, sessions: sessionRepository,
      audit: auditRepository, passwords: passwordHasher,
    }),
    healthService: createHealthService({ pingDatabase, release }),
    requestQueryService: createRequestQueryService({ requests: requestRepository }),
    statusTransitionService: createStatusTransitionService({
      requests: requestRepository, history: historyRepository, unitOfWork: createUnitOfWork(),
    }),
  };
  return { app: createApp({ ...services, log }), services };
}

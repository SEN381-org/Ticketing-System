/**
 * Composition root — DEC-014, DEC-016, DEC-011, DEC-018.
 *
 * Builds the real object graph: repositories → unit of work → services → app.
 * It performs no I/O, so a test can compose the production graph without a
 * database and assert what it contains. `src/server.js` adds the connection, the
 * listener and the lifecycle.
 *
 * DEC-011: only the NotificationSubscriber is registered (TD-001 repaid in part,
 * FR-3.4). The reporting projection is deliberately NOT registered: it has no
 * reconciliation path (OI-14), and the management view aggregates `requests`
 * instead. tests/composition.test.js asserts the registry holds exactly the
 * notification registration, so a further subscriber fails it.
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
import { notificationRepository } from './repositories/notificationRepository.js';
import { registerSubscribers } from './events/subscribers/index.js';
import { createRequestHistoryService } from './services/requestHistoryService.js';
import { createWorkRecordService } from './services/workRecordService.js';
import { createNotificationService } from './services/notificationService.js';
import { createStatusTransitionService } from './services/statusTransitionService.js';
import { createRequestQueryService } from './services/requestQueryService.js';
import { createAuthService } from './services/authService.js';
import { createHealthService } from './services/healthService.js';
import { createApp } from './app.js';

export function composeApplication({ log = console, release = 'unknown' } = {}) {
  registerSubscribers({ notifications: notificationRepository });   // DEC-011, TD-001

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
  // History, work record and notifications (DEC-015 §1).
  const historyServices = {
    requestHistoryService: createRequestHistoryService({ requests: requestRepository, history: historyRepository }),
    workRecordService: createWorkRecordService({
      requests: requestRepository, history: historyRepository, unitOfWork: createUnitOfWork(),
    }),
    notificationService: createNotificationService({ notifications: notificationRepository }),
  };
  return { app: createApp({ ...services, ...historyServices, log }), services };
}

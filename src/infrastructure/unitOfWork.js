/**
 * Unit of work — DEC-015 transaction boundary.
 *
 * Traces to: CON-017, NFR-1.10, AC-NFR-1.10 v0.3 (CR-001), FR-6.3, FR-6.7.
 *
 * The transaction encloses the aggregate: the `requests` update and the
 * `requestHistory` insert commit together or not at all. Review comment R-15:
 * the service previously performed two independent writes while its own header
 * claimed FR-6.7 could not fail separately from the status change it records.
 *
 * `withTransaction` re-runs its callback on a TransientTransactionError, so the
 * callback must be free of side effects. Nothing is published inside it — see
 * the service, where publication happens after this resolves (R-16).
 *
 * This port is injected exactly as the repositories are, so the unit tests stay
 * database-free; a fake records `run()` and can make a write reject.
 */

import mongoose from 'mongoose';

export const TRANSACTION_OPTIONS = Object.freeze({
  readConcern:    { level: 'snapshot' },
  writeConcern:   { w: 'majority' },
  readPreference: 'primary',
});

export function createUnitOfWork({ connection = mongoose.connection } = {}) {
  return {
    async run(work) {
      const session = await connection.startSession();
      try {
        return await session.withTransaction(() => work(session), TRANSACTION_OPTIONS);
      } finally {
        await session.endSession();
      }
    },
  };
}

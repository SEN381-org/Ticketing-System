/**
 * Database connection lifecycle — DEC-002, DEC-003, DEC-018 (Phase 0 decisions).
 *
 * Command buffering is off. With buffering on, a query issued while the cluster
 * is unreachable waits silently instead of failing. In the middle of a
 * transition that wait ends in a client timeout and a retry, which is exactly
 * the duplicate-write path DEC-015's mandatory Idempotency-Key exists to close.
 * Failing fast turns it into an RFC 9457 error the client can see.
 *
 * Import this module before any model, so the setting is in place before a
 * model is compiled.
 */

import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);

/** Bounds how long the driver looks for a server before an operation fails. */
const SERVER_SELECTION_TIMEOUT_MS = 5000;

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
  return mongoose.connection;
}

export async function pingDatabase() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('not connected');
  await db.admin().ping();
}

export const disconnectDatabase = () => mongoose.disconnect();

/** The database user the connection authenticates as. The name only, never the password. */
export function databaseUserOf(uri) {
  try {
    return decodeURIComponent(new URL(uri).username) || '(none)';
  } catch {
    return '(unparseable)';
  }
}

/**
 * Process entry point — DEC-003, DEC-018 (Phase 0 lifecycle decisions).
 *
 *   start      configuration is validated, then the database is connected. If
 *              either fails the process exits non-zero, and systemd's
 *              restart-on-failure retries (DEC-003). A process that started
 *              without its database would pass a careless "port is open" check.
 *   running    a database outage is reported by /api/v1/health as 503. Other
 *              routes fail fast as RFC 9457 problems (buffering is off).
 *   SIGTERM    stop accepting connections, let in-flight requests finish,
 *              disconnect, exit. A hard deadline stops a hung request from
 *              blocking a deploy.
 *
 * Run locally with:  node --env-file=.env src/server.js
 */

import { loadConfig, LISTEN_HOST } from './config.js';
import { connectDatabase, disconnectDatabase, databaseUserOf } from './infrastructure/database.js';
import { composeApplication } from './composition.js';

const SHUTDOWN_DEADLINE_MS = 10_000;

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  try {
    await connectDatabase(config.mongodbUri);
  } catch (error) {
    // The driver's message can include the host. It does not include the password.
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }

  const { app } = composeApplication();
  const server = app.listen(config.port, LISTEN_HOST, () => {
    console.log(`CivicConnect listening on http://${LISTEN_HOST}:${config.port} `
      + `(database user: ${databaseUserOf(config.mongodbUri)})`);
  });

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, shutting down`);
    setTimeout(() => {
      console.error('Shutdown deadline passed; exiting');
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS).unref();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();

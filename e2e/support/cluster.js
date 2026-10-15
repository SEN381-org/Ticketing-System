/**
 * Cluster access for the E2E specs. Reuses the integration harness
 * (tests/integration/_harness.js) and does not copy any of its helpers.
 *
 * Importing the harness: it imports before/after from node:test but registers
 * nothing unless its own useCluster() is called, which this module never does.
 * Its only top-level work is computing `skip` from MONGODB_URI. ./env.js is
 * imported first so that the environment file is loaded before the harness reads it.
 */
import { test } from '@playwright/test';

import { envFileProblem } from './env.js';
import {
  skip as harnessSkip, createFixture, snapshot, newKey, leafValues,
} from '../../tests/integration/_harness.js';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database.js';

/** The harness's refusal reason, or false. A missing env file is reported with it. */
export const skipReason = harnessSkip && envFileProblem ? `${harnessSkip} (${envFileProblem})` : harnessSkip;

export { createFixture, snapshot, newKey, leafValues };

/** Call once at the top of a spec file. Skips with the reason, or connects before the tests and disconnects after. */
export function useCluster() {
  test.skip(Boolean(skipReason), skipReason || '');
  test.beforeAll(async () => { if (!skipReason) await connectDatabase(process.env.MONGODB_URI); });
  test.afterAll(async () => { if (!skipReason) await disconnectDatabase(); });
}

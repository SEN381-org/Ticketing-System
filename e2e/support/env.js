/**
 * Loads the environment file named by E2E_ENV_FILE (default: the repository's
 * .env.test) into process.env. Nothing in it is printed.
 *
 * The SAME file feeds the API server (webServer: node --env-file=<same path>) and
 * the fixtures (this module), otherwise a fixture written to one database is read
 * from another and shows up as a false 404 that looks like NV-43.
 *
 * Import this module before tests/integration/_harness.js: the harness reads
 * MONGODB_URI once, when it is first imported.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const envFile = path.resolve(process.env.E2E_ENV_FILE || path.join(repoRoot, '.env.test'));

export let envFileProblem = null;
try {
  process.loadEnvFile(envFile);
} catch (error) {
  // The path is reported, never the contents. A missing file leaves MONGODB_URI
  // unset, which the guard then refuses.
  envFileProblem = `environment file ${path.basename(envFile)} could not be loaded (${error.code || 'error'})`;
}

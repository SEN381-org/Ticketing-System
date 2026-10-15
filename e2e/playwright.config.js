import { defineConfig } from '@playwright/test';

import { envFile, repoRoot, envFileProblem } from './support/env.js';

/*
 * Guard design. Nothing below starts a process or connects until the guard passes.
 *
 * The rule is the integration harness's (tests/integration/_harness.js): the host
 * parsed from MONGODB_URI must contain "civicconnecttest". It is the harness's own
 * `skip`, imported (dynamically, after the environment file is loaded, because the
 * harness reads MONGODB_URI once at import). When the guard fails:
 *   - `webServer` is omitted, so neither the API nor the client is started;
 *   - every spec calls useCluster() (support/cluster.js), which marks its tests
 *     skipped with the printed reason and does not connect.
 * Skipped is not passed, and the reason is printed below. The URI is never printed.
 */
const { skip } = await import('../tests/integration/_harness.js');

const apiPort = Number(process.env.PORT);
// The client preview port. 4391 is neither Vite's default (4173) nor the API's PORT.
const PREVIEW_PORT = 4391;

let refusal = skip || false;
if (!refusal && (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)) {
  refusal = 'PORT is not set to a valid port in the environment file: E2E cases were NOT run';
}
if (!refusal && apiPort === PREVIEW_PORT) {
  refusal = `PORT must differ from the client preview port ${PREVIEW_PORT}: E2E cases were NOT run`;
}
if (refusal) {
  console.log(`[e2e] ${refusal}${envFileProblem ? ` (${envFileProblem})` : ''}. No server started, no connection made.`);
}

const quote = (p) => `"${p}"`;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  outputDir: 'test-results/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    // localhost is the only plain-HTTP origin where the __Host- Secure cookie works (DEC-018 §3).
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: refusal ? undefined : [
    {
      // The real entry point (composeApplication), with the same env file the fixtures use.
      command: `node --env-file=${quote(envFile)} src/server.js`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // A fresh build every run, then preview. The vite proxy reads PORT and targets 127.0.0.1 (DEF-004).
      command: `npm --prefix client run build && npm --prefix client run preview -- --port ${PREVIEW_PORT} --strictPort`,
      cwd: repoRoot,
      env: { PORT: String(apiPort) },
      url: `http://localhost:${PREVIEW_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});

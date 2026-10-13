import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const clientDir = fileURLToPath(new URL('.', import.meta.url));
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

// The API server reads PORT (src/config.js) and has no default of its own: it
// refuses to start without one. The fallback below, 3000, is only a convenience
// for this proxy and must match the PORT the server was started with. The host
// is 127.0.0.1, not localhost (DEF-004): the server listens on the IPv4
// loopback only (LISTEN_HOST) and localhost can resolve to ::1.
const apiPort = process.env.PORT || '3000';
const proxy = { '/api': { target: `http://127.0.0.1:${apiPort}` } };

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  // ../shared/domainValues.js is the only file imported from outside client/,
  // so only client/ and shared/ are served. The repository root (where .env
  // lives) is deliberately not allowed.
  server: { fs: { allow: [clientDir, sharedDir] }, proxy },
  preview: { proxy },
});

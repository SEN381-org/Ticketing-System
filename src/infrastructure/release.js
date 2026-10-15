/**
 * Release identification — M3 staging (the deployed candidate must be identifiable), DEC-003.
 *
 * The commit the running process was started from, reported by /api/v1/health so an operator
 * or assessor can confirm which release candidate is deployed. Resolved once, at startup:
 *
 *   1. RELEASE_COMMIT from the environment, if it is a full or abbreviated commit hash
 *      (7 to 40 hex characters). The deploy step may set it in the environment file.
 *   2. Otherwise `git rev-parse HEAD` in the repository the process runs from. DEC-003 deploys
 *      a checkout of the release tag, so this is that tag's commit.
 *   3. Otherwise 'unknown'. The process still starts: a missing release identifier is reported,
 *      never a reason to refuse service.
 *
 * Only a commit hash is ever returned. A value that is not one is ignored rather than echoed,
 * so the health response cannot carry arbitrary text from the environment.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const COMMIT = /^[0-9a-f]{7,40}$/;
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GIT_TIMEOUT_MS = 2000;

function gitHead(cwd) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * @param {{ env?: object, readGitHead?: () => string }} [options] injectable for tests
 * @returns {string} a lower-case commit hash, or 'unknown'
 */
export function resolveRelease({ env = process.env, readGitHead = () => gitHead(REPOSITORY_ROOT) } = {}) {
  const fromEnv = String(env.RELEASE_COMMIT ?? '').trim().toLowerCase();
  if (COMMIT.test(fromEnv)) return fromEnv;
  try {
    const head = String(readGitHead()).trim().toLowerCase();
    if (COMMIT.test(head)) return head;
  } catch {
    // no git, or not a repository: fall through
  }
  return 'unknown';
}

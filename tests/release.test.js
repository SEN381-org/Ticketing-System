/**
 * Release identification — M3 staging (the deployed candidate must be identifiable), DEC-003.
 * Unit level: resolveRelease() with the environment and the git lookup injected.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveRelease } from '../src/infrastructure/release.js';

const HASH = '0867575a1b2c3d4e5f60718293a4b5c6d7e8f901';
const OTHER = 'aaaaaaa1b2c3d4e5f60718293a4b5c6d7e8f9012';
const noGit = () => { throw new Error('not a git repository'); };

test('R1 RELEASE_COMMIT wins when it is a commit hash, and is lower-cased', () => {
  assert.equal(resolveRelease({ env: { RELEASE_COMMIT: HASH }, readGitHead: () => OTHER }), HASH);
  assert.equal(resolveRelease({ env: { RELEASE_COMMIT: ` ${HASH.toUpperCase()} ` }, readGitHead: noGit }), HASH);
  assert.equal(resolveRelease({ env: { RELEASE_COMMIT: '0867575' }, readGitHead: noGit }), '0867575');
});

test('R2 without RELEASE_COMMIT, the checkout HEAD is used', () => {
  assert.equal(resolveRelease({ env: {}, readGitHead: () => `${OTHER}\n` }), OTHER);
});

test('R3 a value that is not a commit hash is never echoed', () => {
  // Expected: not-a-hash text from the environment or from git falls through, never returned.
  for (const bad of ['v1.0-rc1', '<script>', 'abc', '0867575 extra', 'g'.repeat(40), '1'.repeat(41)]) {
    assert.equal(resolveRelease({ env: { RELEASE_COMMIT: bad }, readGitHead: noGit }), 'unknown', bad);
    assert.equal(resolveRelease({ env: {}, readGitHead: () => bad }), 'unknown', bad);
  }
  assert.equal(resolveRelease({ env: { RELEASE_COMMIT: 'not-a-hash' }, readGitHead: () => OTHER }), OTHER);
});

test('R4 with no usable source the result is "unknown", and nothing throws', () => {
  assert.equal(resolveRelease({ env: {}, readGitHead: noGit }), 'unknown');
});

test('R5 the default git lookup reads this checkout', () => {
  // Expected: in the repository the suite runs from, HEAD resolves to a 40-character hash.
  assert.match(resolveRelease({ env: {} }), /^[0-9a-f]{40}$/);
});

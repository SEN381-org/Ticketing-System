/**
 * The single source of the controlled domain values — FR-6.1, FR-1.2.
 *
 * Basis: in M2 the application slice used invented statuses and roles that
 * contradicted FR-6.1 and FR-1.2, recorded at the time in the AI Usage Register
 * (v0.12, row 48, 2026-10-01); it predates the Defect Register, so it has no DEF
 * identifier. These tests show there is one definition and that
 * it is browser-safe. They do not show that a client bundle builds.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as shared from '../shared/domainValues.js';
import * as models from '../src/models/_shared.js';

test('_shared.js re-exports the very same objects as shared/domainValues.js — one definition', () => {
  assert.equal(models.STATUS, shared.STATUS);
  assert.equal(models.ROLE, shared.ROLE);
  assert.equal(models.TERMINAL_STATUSES, shared.TERMINAL_STATUSES);
});

test('shared/domainValues.js has no import or require, so it is browser-safe — DEC-014', () => {
  const text = readFileSync(new URL('../shared/domainValues.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*import[\s{*'"]/m, 'static import found');
  assert.doesNotMatch(text, /\bimport\s*\(/, 'dynamic import found');
  assert.doesNotMatch(text, /\brequire\s*\(/, 'require found');
});

test('shared values are exactly the FR-6.1 statuses and FR-1.2 roles — AC-FR-6.1', () => {
  assert.deepEqual(Object.values(shared.STATUS),
    ['Received', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Rejected']);
  assert.deepEqual(Object.values(shared.ROLE),
    ['Requester', 'Technician', 'Coordinator', 'Manager', 'Security Officer', 'Administrator']);
  assert.deepEqual([...shared.TERMINAL_STATUSES], ['Closed', 'Rejected']);
  assert.ok(Object.isFrozen(shared.STATUS) && Object.isFrozen(shared.ROLE)
    && Object.isFrozen(shared.TERMINAL_STATUSES));
});

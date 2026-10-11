/**
 * Verification evidence for the composition root and Technical Debt Register TD-001.
 *
 * DEC-011's subscribers are deliberately not registered in M3 Phase 0 (TD-001).
 * This asserts the registry is empty once the production graph is composed. It
 * is meant to break: registering a subscriber fails it, which forces TD-001 to
 * be repaid and this test replaced in the same change, rather than the debt
 * entry silently going stale.
 *
 * What this does NOT show: that DEC-011 consequences work. They are not wired.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../src/composition.js';
import { listSubscriptions, publish, EVENTS } from '../src/events/requestEvents.js';

test('no DEC-011 subscriber is registered in the composed application — TD-001', () => {
  composeApplication({ log: { error() {} } });
  assert.deepEqual(listSubscriptions(), [],
    'a subscriber is registered: repay TD-001 in the Technical Debt Register and replace this test');
});

test('publishing with no subscriber is a no-op, so a transition is unaffected — TD-001', () => {
  assert.doesNotThrow(() => publish(EVENTS.REQUEST_STATUS_CHANGED, { requestId: 'r1' }));
});

test('composition performs no I/O: the graph builds with no database', () => {
  const { app, services } = composeApplication({ log: { error() {} } });
  assert.equal(typeof app, 'function');
  assert.deepEqual(Object.keys(services).sort(),
    ['authService', 'healthService', 'statusTransitionService']);
});

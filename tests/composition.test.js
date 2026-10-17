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

// M4 (T4): the intended TD-001 change. FR-3.4 needs the NotificationSubscriber, so exactly
// that registration is expected. The reporting projection stays unregistered (OI-14).
test('exactly the NotificationSubscriber is registered in the composed application — TD-001, FR-3.4, OI-14', () => {
  composeApplication({ log: { error() {} } });
  assert.deepEqual(listSubscriptions(), [{
    event: EVENTS.REQUEST_STATUS_CHANGED, name: 'NotificationSubscriber', requirement: 'FR-3.4 / FR-3.5 / SCP-004',
  }], 'a different set of subscribers is registered: update TD-001 and this test together');
});

test('publishing with no subscriber is a no-op, so a transition is unaffected — TD-001', () => {
  assert.doesNotThrow(() => publish(EVENTS.REQUEST_STATUS_CHANGED, { requestId: 'r1' }));
});

test('composition performs no I/O: the graph builds with no database', () => {
  const { app, services } = composeApplication({ log: { error() {} } });
  assert.equal(typeof app, 'function');
  assert.deepEqual(Object.keys(services).sort(),
    ['authService', 'healthService', 'requestListService', 'requestQueryService', 'statusTransitionService']);
});

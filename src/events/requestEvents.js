/**
 * In-process domain event publication for request lifecycle events.
 *
 * Traces to: DEC-011, NFR-1.7, RSK-012.
 *
 * DEC-011 records in-process publication rather than direct invocation of each
 * consequence. Two properties of that decision are implemented here rather than
 * left to convention:
 *
 *   1. Every subscription is registered through this module, so the set of
 *      consequences of an event is enumerable by reading one file. DEC-011
 *      accepts, as a recorded cost, that no single location states what a
 *      transition does; the registry is the mitigation for that cost and for
 *      the traceability exposure in RSK-012.
 *
 *   2. EventEmitter dispatches synchronously, so a throwing subscriber would
 *      propagate back into the transition that published the event. Every
 *      subscriber is therefore wrapped: its failure is logged and contained.
 *      The transition and its consequences are deliberately not atomic with
 *      one another.
 */

import { EventEmitter } from 'node:events';

export const EVENTS = Object.freeze({
  REQUEST_STATUS_CHANGED: 'request.status.changed',
});

const emitter = new EventEmitter();

/** @type {Array<{event: string, name: string, requirement: string}>} */
const registry = [];

/**
 * Register a subscriber. Every subscription in the system passes through here.
 *
 * @param {string} event        one of EVENTS
 * @param {string} name         the subscriber's name, for the registry and for logs
 * @param {string} requirement  the requirement or scope item the subscriber serves
 * @param {(payload: object) => void | Promise<void>} handler
 */
export function subscribe(event, name, requirement, handler) {
  registry.push({ event, name, requirement });

  emitter.on(event, (payload) => {
    try {
      const result = handler(payload);
      if (result && typeof result.then === 'function') {
        result.catch((error) => reportSubscriberFailure(name, event, error));
      }
    } catch (error) {
      reportSubscriberFailure(name, event, error);
    }
  });
}

export function publish(event, payload) {
  emitter.emit(event, payload);
}

/** The enumerable set of consequences. Read by tests and by review. */
export function listSubscriptions() {
  return registry.map((entry) => ({ ...entry }));
}

/** Test seam only. Not called by application code. */
export function resetSubscriptions() {
  emitter.removeAllListeners();
  registry.length = 0;
}

let onFailure = (name, event, error) => {
  console.error(`[requestEvents] subscriber '${name}' failed on '${event}':`, error.message);
};

/** Test seam only. */
export function setFailureReporter(fn) { onFailure = fn; }

function reportSubscriberFailure(name, event, error) { onFailure(name, event, error); }

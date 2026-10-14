/**
 * Host markers, one per environment. Traces to: DEC-003 (environment map).
 *
 * DEC-003 (environment map, Test row) is the authoritative source for the test
 * marker: it records the test cluster's hostname, which contains
 * `civicconnecttest` with no hyphen, separately from the environment name
 * `civicconnect-test` and the Atlas project `CivicConnect-Test` (OI-19).
 *
 * Only the test marker is recorded. There is deliberately no entry for staging
 * or production: until DEC-003 records a host marker for them, callers must
 * refuse those environments. A marker is never accepted from the command line.
 */

export const TEST_CLUSTER_MARKER = 'civicconnecttest';

/** Environment name to the marker the cluster host must contain. */
export const CLUSTER_MARKERS = Object.freeze({ test: TEST_CLUSTER_MARKER });

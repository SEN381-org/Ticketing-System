/**
 * Host markers, one per environment. Traces to: DEC-003 (environment map).
 *
 * DEC-003 (environment map, Test row) is the authoritative source for the test
 * marker: it records the test cluster's hostname, which contains
 * `civicconnecttest` with no hyphen, separately from the environment name
 * `civicconnect-test` and the Atlas project `CivicConnect-Test` (OI-19).
 *
 * The staging marker is `civicconnectstaging`, the first label of the staging
 * Atlas cluster's hostname. DEC-003 v0.4's environment map (Staging row) records
 * it, with the cluster as built; that version is in review (PR #99). Neither marker
 * contains the other, so a test host never satisfies the staging check and a
 * staging host never satisfies the test check.
 *
 * There is deliberately no entry for production: until DEC-003 records a host
 * marker for it, callers must refuse it. A marker is never accepted from the
 * command line.
 */

export const TEST_CLUSTER_MARKER = 'civicconnecttest';
export const STAGING_CLUSTER_MARKER = 'civicconnectstaging';

/** Environment name to the marker the cluster host must contain. */
export const CLUSTER_MARKERS = Object.freeze({ test: TEST_CLUSTER_MARKER, staging: STAGING_CLUSTER_MARKER });

/**
 * Maintains the per-status counts the management dashboard reads.
 *
 * Traces to: FR-8.1, FR-8.2, AC-FR-8.1. Subscribes under DEC-011.
 *
 * Review comment R-17. The projection is keyed by {campusId, categoryId, status}
 * — FR-8.2 reports by category, and no requirement mentions departments (R-10).
 *
 * This projection has no authority of its own. DEC-011 deliberately contains
 * subscriber failures, so a failed or redelivered adjustment leaves the counts
 * drifted. Two things follow, and both are recorded rather than hoped away:
 *
 *   - A reconciliation job rebuilds the counts from `requests` with a $group.
 *     The rebuild is exact even after PROC-001 anonymisation, because
 *     anonymisation keeps category and status. It is M3 work (OI-14).
 *   - Date-filtered views (FR-8.5) must query `requests` directly. A counter
 *     cannot be sliced by an arbitrary date range.
 */

export async function onStatusChanged(payload, { reportingCounts }) {
  await reportingCounts.adjust({
    campusId:   payload.campusId,
    categoryId: payload.categoryId,
    decrement:  payload.fromStatus,
    increment:  payload.toStatus,
  });
}

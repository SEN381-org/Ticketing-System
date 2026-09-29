/**
 * Maintains the per-status counts the management view reads.
 * Traces to: feature group 8. Subscribes under DEC-011.
 */
export async function onStatusChanged(payload, { reportingCounts }) {
  await reportingCounts.adjust({
    departmentId: payload.departmentId,
    decrement:    payload.fromStatus,
    increment:    payload.toStatus,
  });
}

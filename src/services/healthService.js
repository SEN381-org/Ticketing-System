/**
 * Health check — NFR-1.6, AC-NFR-1.6, DEC-015, DEC-018 §5.
 *
 * Reports application and data-store availability without a user account. The
 * database check is a `ping` only: it reads no collection and no personal data.
 * The ping is bounded so the endpoint answers even when the cluster does not,
 * which is when the deploy script (DEC-003) and an operator most need it.
 */

export const PING_TIMEOUT_MS = 3000;

export function createHealthService({ pingDatabase, timeoutMs = PING_TIMEOUT_MS }) {
  async function check() {
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('ping timed out')), timeoutMs);
    });
    try {
      await Promise.race([pingDatabase(), timedOut]);
      return { application: 'up', database: 'up' };
    } catch {
      return { application: 'up', database: 'down' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { check };
}

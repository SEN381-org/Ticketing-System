/**
 * NFR-2.1 submission test, part 3: the server-side timings, read from the performance log.
 * Traces to: NFR-2.1, AC-NFR-2.1, NFR-1.11 (performance log), DEC-017 (no personal information
 * in the log).
 *
 * AC-NFR-2.1: Given "a sustained load of 100 concurrent authenticated users", When "100 service
 * requests are submitted", Then "at least 95 confirmations are returned within 3 seconds,
 * measured server-side".
 *
 * Runs ON THE VM after perf/submit-run.js. It reads the service's log from standard input. Only
 * lines that parse as JSON with kind "perf", operation "POST /api/v1/requests" and outcome 201 are
 * used; every other line (other operations, other statuses, the service's own messages, anything
 * that is not JSON) is ignored. Each used entry has exactly the four members NFR-1.11 defines, and
 * nothing else from a line is printed. The first 100 such entries, in log order, are judged:
 * PASS if at least 95 of them have durationMs <= 3000; FAIL otherwise; NOT RUN if fewer than 100
 * entries are found (the window was wrong, or the run did not submit 100).
 *
 * Usage (on the VM; --since / --until are printed by submit-run.js):
 *   journalctl -u civicconnect-staging -o cat --since "<start UTC>" --until "<end UTC>" \
 *     | node server-timings.js [--limit 3000] [--confirmations 95] [--entries 100]
 *
 * One run; not re-run for a better number.
 * Exit code: 0 PASS; 1 FAIL; 2 not run.
 */

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';

function refuse(reason) {
  console.log(`NOT RUN: ${reason}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      limit: { type: 'string', default: '3000' },
      confirmations: { type: 'string', default: '95' },
      entries: { type: 'string', default: '100' },
    },
  }).values;
} catch (e) {
  refuse(`usage: ${e.message}`);
}
const int = (name, min, max) => {
  const v = Number(args[name]);
  if (!Number.isInteger(v) || v < min || v > max) refuse(`--${name} must be an integer from ${min} to ${max}`);
  return v;
};
const LIMIT_MS = int('limit', 1, 600_000);
const ENTRIES = int('entries', 1, 100_000);
const REQUIRED = int('confirmations', 1, ENTRIES);
if (process.stdin.isTTY) refuse('no input: pipe journalctl into this script (see the usage in its header)');

const OPERATION = 'POST /api/v1/requests';
const used = [];
let lineCount = 0;
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  lineCount += 1;
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  if (entry === null || typeof entry !== 'object') continue;
  if (entry.kind !== 'perf' || entry.operation !== OPERATION || entry.outcome !== 201) continue;
  if (!Number.isFinite(entry.durationMs)) continue;
  used.push({ kind: entry.kind, operation: entry.operation, durationMs: entry.durationMs, outcome: entry.outcome });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

console.log('NFR-2.1 server-side timings (performance log)');
console.log(`Lines read                : ${lineCount}`);
console.log(`Entries "${OPERATION}" with outcome 201: ${used.length}`);
if (used.length < ENTRIES) {
  refuse(`${used.length} entries found; ${ENTRIES} are needed (check the window and the unit name)`);
}

const judged = used.slice(0, ENTRIES);
const within = judged.filter((e) => e.durationMs <= LIMIT_MS).length;
const sorted = judged.map((e) => e.durationMs).sort((a, b) => a - b);
console.log(`Judged (first ${ENTRIES})       : ${judged.length}`);
console.log(`Within ${LIMIT_MS} ms (<=)       : ${within}`);
console.log(`durationMs p50 / p95 / max: ${pct(sorted, 50)} / ${pct(sorted, 95)} / ${sorted.at(-1)}`);
const pass = within >= REQUIRED;
console.log(`RESULT ${pass ? 'PASS' : 'FAIL'}: AC-NFR-2.1, ${within} of ${ENTRIES} confirmations within ${LIMIT_MS} ms server-side (at least ${REQUIRED} required)`);
process.exit(pass ? 0 : 1);

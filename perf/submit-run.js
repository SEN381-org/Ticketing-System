/**
 * NFR-2.1 submission test, part 2: 100 simultaneous submissions, from South Africa against the
 * staging HTTPS URL. The server-side timing is judged by perf/server-timings.js, not here.
 * Traces to: NFR-2.1, AC-NFR-2.1, NFR-1.11 (the performance log), DEC-003 v0.4, DEC-015.
 *
 * AC-NFR-2.1: Given "a sustained load of 100 concurrent authenticated users", When "100 service
 * requests are submitted", Then "at least 95 confirmations are returned within 3 seconds,
 * measured server-side".
 *
 * Steps: <users> Requester fixture users (generate-fixtures.js) log in, staggered over <ramp>, so
 * all of them are authenticated at once; when the last login has returned, after a <settle>
 * pause, every one of them submits ONE request (POST /api/v1/requests, a fresh Idempotency-Key,
 * a non-security category) in the same tick, so all submissions start within the same second.
 *
 * This script records, per submission, the client-side status and latency (network included, so
 * not the AC measure), checks that all starts fell within one second, and prints the UTC window
 * [start, end] of the submissions. "Measured server-side" is then read from the service's
 * performance log (NFR-1.11) for that window, on the VM, by server-timings.js.
 *
 * TLS: the staging certificate is trusted through NODE_EXTRA_CA_CERTS. The run refuses to start
 * if NODE_TLS_REJECT_UNAUTHORIZED is "0", or if NODE_EXTRA_CA_CERTS is not set.
 *
 * Usage (on the load client, in South Africa):
 *   NODE_EXTRA_CA_CERTS=$HOME/staging.crt node submit-run.js \
 *     --base-url https://<VM IP> --fixtures ./perf-fixtures.json --out <report path> \
 *     --client-location "<city, country>" [--users 100] [--ramp 30] [--settle 3] [--timeout 30]
 *
 * One run; not re-run for a better number. The report is written as produced. Each run uses
 * the fixture users and creates 100 requests.
 * Exit code: 0 every submission was confirmed (201); 1 the run completed with a login failure
 * or a submission that was not confirmed; 2 not run.
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { X509Certificate, randomUUID } from 'node:crypto';
import path from 'node:path';

const lines = [];
const say = (text = '') => { console.log(text); lines.push(text); };
function refuse(reason) {
  console.log(`NOT RUN: ${reason}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      'base-url': { type: 'string' },
      fixtures: { type: 'string' },
      out: { type: 'string' },
      'client-location': { type: 'string' },
      users: { type: 'string', default: '100' },
      ramp: { type: 'string', default: '30' },
      settle: { type: 'string', default: '3' },
      timeout: { type: 'string', default: '30' },
    },
  }).values;
} catch (e) {
  refuse(`usage: ${e.message}`);
}

const num = (name, min, max) => {
  const v = Number(args[name]);
  if (!Number.isFinite(v) || v < min || v > max) refuse(`--${name} must be a number from ${min} to ${max}`);
  return v;
};
for (const required of ['base-url', 'fixtures', 'out', 'client-location']) {
  if (!args[required]) refuse(`--${required} is required`);
}
const USERS = num('users', 1, 500);
const RAMP_S = num('ramp', 0, 600);
const SETTLE_S = num('settle', 0, 60);
const TIMEOUT_S = num('timeout', 1, 120);

// ---- TLS: trust the staging certificate explicitly, never disable verification ----------------
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  refuse('NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate verification; unset it');
}
const caFile = process.env.NODE_EXTRA_CA_CERTS;
if (!caFile) refuse('NODE_EXTRA_CA_CERTS is not set; point it at the staging certificate');
let caFingerprint;
try {
  caFingerprint = new X509Certificate(await readFile(caFile)).fingerprint256;
} catch {
  refuse('NODE_EXTRA_CA_CERTS does not name a readable PEM certificate');
}

let base;
try {
  base = new URL(args['base-url']);
} catch {
  refuse('--base-url is not a URL');
}
if (base.protocol !== 'https:') refuse('--base-url must be https://');
const origin = base.origin;
// The VM's IP is recorded redacted (DEC-003 v0.4): never print the last octet.
const shownOrigin = origin.replace(/(\d+\.\d+\.\d+\.)\d+/, '$1[redacted]');

const fixtures = JSON.parse(await readFile(args.fixtures, 'utf8'));
if (!Array.isArray(fixtures.requesters) || fixtures.requesters.length < USERS) {
  refuse(`the fixture file holds ${fixtures.requesters?.length ?? 0} Requesters; --users is ${USERS} (regenerate with generate-fixtures.js)`);
}
if (!fixtures.categoryId) refuse('the fixture file names no category; regenerate with generate-fixtures.js');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const PAD = (n) => String(n).padStart(2, '0');
/** "2026-10-17 14:05:09 UTC", the form journalctl accepts for --since / --until. */
const forJournal = (d) => `${d.getUTCFullYear()}-${PAD(d.getUTCMonth() + 1)}-${PAD(d.getUTCDate())} `
  + `${PAD(d.getUTCHours())}:${PAD(d.getUTCMinutes())}:${PAD(d.getUTCSeconds())} UTC`;

// ---- Run ------------------------------------------------------------------------------------------
const startedAt = new Date();
say('NFR-2.1 submission run (staging)');
say(`Started (UTC)        : ${startedAt.toISOString()}`);
say(`Target               : ${shownOrigin} (staging VM, Azure Spain Central)`);
say(`Client location      : ${args['client-location']}`);
say(`Node                 : ${process.version}`);
// Fixed text only: no environment value is logged. The trusted certificate is identified by its SHA-256.
say(`NODE_EXTRA_CA_CERTS  : set (SHA-256: ${caFingerprint})`);
say(`NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined ? 'unset' : 'set (not 0)'}`);
say(`Fixture run          : ${fixtures.run}`);
say(`Workload             : ${USERS} Requesters log in (ramp ${RAMP_S} s), settle ${SETTLE_S} s, then each submits one request at the same moment; timeout ${TIMEOUT_S} s`);
say();

const requesters = fixtures.requesters.slice(0, USERS);
const sessions = Array(USERS).fill(null);
const loginFailures = [];

await Promise.all(requesters.map(async (fixture, i) => {
  await sleep(RAMP_S > 0 ? (i / USERS) * RAMP_S * 1000 : 0);
  try {
    const res = await fetch(`${origin}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fixture.email, password: fixtures.password }),
      signal: AbortSignal.timeout(TIMEOUT_S * 1000),
    });
    await res.arrayBuffer();
    const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
    if (res.status === 201 && cookie) sessions[i] = cookie;
    else loginFailures.push(`HTTP ${res.status}`);
  } catch (e) {
    loginFailures.push(e.name === 'TimeoutError' ? `timeout after ${TIMEOUT_S} s` : `${e.name}: ${e.cause?.code ?? e.message}`);
  }
}));
const authenticated = sessions.filter(Boolean).length;
say(`Authenticated        : ${authenticated} of ${USERS}`);
const loginKinds = {};
for (const m of loginFailures) loginKinds[m] = (loginKinds[m] ?? 0) + 1;
for (const [m, n] of Object.entries(loginKinds)) say(`  ${n} x login ${m}`);
if (authenticated === 0) {
  say('RESULT FAIL: NFR-2.1, no user could log in; nothing was submitted');
  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, `${lines.join('\n')}\n`);
  process.exit(1);
}
await sleep(SETTLE_S * 1000);

// The synchronised moment: every submission is started in this one synchronous loop.
const timings = [];   // { status, ms, error, sentAt (Date), doneAt (Date) }
const submit = async (cookie) => {
  const sentAt = new Date();
  const t0 = performance.now();
  try {
    const res = await fetch(`${origin}/api/v1/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        categoryId: fixtures.categoryId,
        location: 'NFR-2.1 submission test',
        description: `Synthetic request for the NFR-2.1 submission test, run ${fixtures.run}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_S * 1000),
    });
    await res.arrayBuffer();
    timings.push({ status: res.status, ms: performance.now() - t0, error: null, sentAt, doneAt: new Date() });
  } catch (e) {
    timings.push({
      status: null, ms: performance.now() - t0, sentAt, doneAt: new Date(),
      error: e.name === 'TimeoutError' ? `timeout after ${TIMEOUT_S} s` : `${e.name}: ${e.cause?.code ?? e.message}`,
    });
  }
};
await Promise.all(sessions.filter(Boolean).map(submit));
const endedAt = new Date();

// ---- Report ---------------------------------------------------------------------------------------
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN);
const fmt = (ms) => (Number.isFinite(ms) ? `${ms.toFixed(0)} ms` : '-');
const first = new Date(Math.min(...timings.map((t) => t.sentAt)));
const last = new Date(Math.max(...timings.map((t) => t.doneAt)));
const startSpreadMs = Math.max(...timings.map((t) => t.sentAt)) - first;
const confirmed = timings.filter((t) => t.status === 201);
const ms = timings.map((t) => t.ms).sort((a, b) => a - b);
const byStatus = {};
for (const t of timings) byStatus[t.status ?? 'error'] = (byStatus[t.status ?? 'error'] ?? 0) + 1;

say();
say(`Submissions sent     : ${timings.length}; all started within ${startSpreadMs.toFixed(0)} ms of the first (${startSpreadMs < 1000 ? 'within the same second' : 'NOT within the same second'})`);
say(`Submission window (UTC): [${first.toISOString()}, ${last.toISOString()}]`);
say(`For journalctl       : --since "${forJournal(new Date(Math.floor(first.getTime() / 1000) * 1000))}" `
  + `--until "${forJournal(new Date(Math.ceil(last.getTime() / 1000) * 1000 + 1000))}"`);
say(`Confirmed (201)      : ${confirmed.length} of ${timings.length}; statuses ${JSON.stringify(byStatus)}`);
say(`Client-side latency (network included; NOT the AC measure): p50 ${fmt(pct(ms, 50))}  p95 ${fmt(pct(ms, 95))}  max ${fmt(ms.at(-1))}`);
const errors = {};
for (const t of timings.filter((x) => x.status !== 201)) errors[t.error ?? `HTTP ${t.status}`] = (errors[t.error ?? `HTTP ${t.status}`] ?? 0) + 1;
for (const [k, n] of Object.entries(errors)) say(`  ${n} x ${k}`);
say(`Ended (UTC)          : ${endedAt.toISOString()}`);
say();
const complete = authenticated === USERS && confirmed.length === USERS;
say(`CLIENT-SIDE ${complete ? 'COMPLETE' : 'INCOMPLETE'}: ${confirmed.length} of ${USERS} confirmations received (${authenticated} authenticated).`);
say('AC-NFR-2.1 is judged server-side: run server-timings.js on the VM over the window above.');

await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
await writeFile(args.out, `${lines.join('\n')}\n`);
process.exit(complete ? 0 : 1);

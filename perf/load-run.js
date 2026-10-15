/**
 * NFR-2.4 load test, part 2: the load run, from South Africa against the staging HTTPS URL.
 * Traces to: NFR-2.4, AC-NFR-2.4, DEC-003 v0.4 (Performance testing and region), DEC-010.
 *
 * NFR-2.4: "The system will sustain 100 concurrent authenticated users with no failed request
 * and no unhandled server error."
 * AC-NFR-2.4: Given "100 concurrent authenticated users exercising the standard journeys for
 * 10 minutes", When "the run completes", Then "no request failed and no unhandled server error
 * was recorded".
 *
 * Each virtual user is one fixture user (generate-fixtures.js). It logs in once, during the
 * ramp, then loops until the window ends: read its request (GET /api/v1/requests/{id}), think,
 * and on every <transition-every>-th iteration reject one of its fresh Received requests
 * (POST /api/v1/requests/{id}/transitions). The window starts when the last user has logged
 * in, so all <users> are concurrently authenticated for the whole <duration>.
 *
 * A request FAILS if it errors at the network or TLS level, takes longer than <timeout>, or
 * returns a status other than the expected one (login 201, read 200, transition 201).
 * An UNHANDLED SERVER ERROR is any 5xx. The run PASSES only with zero of both (NFR-2.4).
 * Latency percentiles are reported for interpretation; NFR-2.4 sets no latency target.
 *
 * TLS: the staging certificate is trusted through NODE_EXTRA_CA_CERTS. The run refuses to start
 * if NODE_TLS_REJECT_UNAUTHORIZED is "0", or if NODE_EXTRA_CA_CERTS is not set.
 *
 * Usage (on the load client, in South Africa):
 *   NODE_EXTRA_CA_CERTS=$HOME/staging.crt node load-run.js \
 *     --base-url https://<VM IP> --fixtures ./perf-fixtures.json --out <report path> \
 *     --client-location "<city, country>" [--users 100] [--duration 600] [--ramp 60] \
 *     [--think 10] [--transition-every 6] [--timeout 30]
 *
 * One run. The report is written as produced; it is not re-run for a better number.
 * Exit code: 0 PASS; 1 FAIL (the run completed with a failed request or a 5xx); 2 not run.
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
      duration: { type: 'string', default: '600' },
      ramp: { type: 'string', default: '60' },
      think: { type: 'string', default: '10' },
      'transition-every': { type: 'string', default: '6' },
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
const DURATION_S = num('duration', 1, 3600);
const RAMP_S = num('ramp', 0, 600);
const THINK_S = num('think', 0, 120);
const TRANSITION_EVERY = num('transition-every', 1, 1000);
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
if (!Array.isArray(fixtures.users) || fixtures.users.length < USERS) {
  refuse(`the fixture file holds ${fixtures.users?.length ?? 0} users; --users is ${USERS}`);
}
const iterationsPerUser = Math.ceil(DURATION_S / Math.max(THINK_S, 0.001));
const transitionsNeeded = Math.ceil(iterationsPerUser / TRANSITION_EVERY) + 1;
if (fixtures.users[0].transitionRequestIds.length < transitionsNeeded) {
  refuse(`each user needs about ${transitionsNeeded} requests to reject; the fixtures hold ${fixtures.users[0].transitionRequestIds.length}`);
}

// ---- Measurement --------------------------------------------------------------------------------
const results = [];      // { kind, status, ms, ok, error, phase }
const EXPECTED = { login: 201, read: 200, transition: 201 };
let phase = 'ramp';

async function call(kind, url, init) {
  const started = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_S * 1000) });
    const ms = performance.now() - started;
    await res.arrayBuffer();   // drain the body so the connection is reused
    const ok = res.status === EXPECTED[kind];
    results.push({ kind, status: res.status, ms, ok, error: ok ? null : `HTTP ${res.status}`, phase });
    return res;
  } catch (e) {
    const ms = performance.now() - started;
    const error = e.name === 'TimeoutError' ? `timeout after ${TIMEOUT_S} s` : `${e.name}: ${e.cause?.code ?? e.message}`;
    results.push({ kind, status: null, ms, ok: false, error, phase });
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function virtualUser(fixture, index, windowEndsAt, loggedIn) {
  // Stagger logins across the ramp: every login is one scrypt verification on the server.
  await sleep(RAMP_S > 0 ? (index / USERS) * RAMP_S * 1000 : 0);
  const login = await call('login', `${origin}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: fixture.email, password: fixtures.password }),
  });
  const cookie = login?.headers.getSetCookie()[0]?.split(';')[0];
  loggedIn();
  if (!cookie) return;    // already counted as a failed login
  await windowEndsAt.ready;

  const fresh = [...fixture.transitionRequestIds];
  let iteration = 0;
  // Offset each user within one think period so the users do not move in lockstep.
  await sleep((index / USERS) * THINK_S * 1000);
  while (performance.now() < windowEndsAt.at) {
    iteration += 1;
    await call('read', `${origin}/api/v1/requests/${fixture.readRequestId}`, { headers: { cookie } });
    if (iteration % TRANSITION_EVERY === 0 && fresh.length > 0) {
      const id = fresh.shift();
      await call('transition', `${origin}/api/v1/requests/${id}/transitions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, 'if-match': '"v0"', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ toStatus: 'Rejected', reason: `NFR-2.4 load test, run ${fixtures.run}` }),
      });
    }
    await sleep(THINK_S * 1000);
  }
}

// ---- Run ------------------------------------------------------------------------------------------
const startedAt = new Date();
say('NFR-2.4 load run (staging)');
say(`Started (UTC)        : ${startedAt.toISOString()}`);
say(`Target               : ${shownOrigin} (staging VM, Azure Spain Central)`);
say(`Database             : staging Atlas cluster civicconnectstaging, M0, Azure westeurope (Netherlands); not colocated with the VM`);
say(`Client location      : ${args['client-location']}`);
say(`Node                 : ${process.version}`);
say(`NODE_EXTRA_CA_CERTS  : set (${path.basename(caFile)}; SHA-256 ${caFingerprint})`);
say(`NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? 'unset'}`);
say(`Fixture run          : ${fixtures.run}`);
say(`Workload             : ${USERS} users; ramp ${RAMP_S} s; window ${DURATION_S} s after the last login; think ${THINK_S} s; a transition every ${TRANSITION_EVERY} iterations; timeout ${TIMEOUT_S} s`);
say();

let pending = USERS;
let resolveReady;
const windowEndsAt = { at: Infinity, ready: new Promise((resolve) => { resolveReady = resolve; }) };
let windowStartedAt;
const loggedIn = () => {
  pending -= 1;
  if (pending === 0) {
    phase = 'window';
    windowStartedAt = new Date();
    windowEndsAt.at = performance.now() + DURATION_S * 1000;
    resolveReady();
  }
};

await Promise.all(fixtures.users.slice(0, USERS).map((f, i) => virtualUser(f, i, windowEndsAt, loggedIn)));
const endedAt = new Date();

// ---- Report ---------------------------------------------------------------------------------------
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN);
const fmt = (ms) => (Number.isFinite(ms) ? `${ms.toFixed(0)} ms` : '-');

say(`All users logged in (UTC): ${windowStartedAt?.toISOString() ?? 'never (a login failed)'}`);
say(`Ended (UTC)          : ${endedAt.toISOString()}`);
say();
say('Per request type (all phases):');
for (const kind of ['login', 'read', 'transition']) {
  const of = results.filter((r) => r.kind === kind);
  const ms = of.map((r) => r.ms).sort((a, b) => a - b);
  const byStatus = {};
  for (const r of of) byStatus[r.status ?? 'error'] = (byStatus[r.status ?? 'error'] ?? 0) + 1;
  say(`  ${kind.padEnd(10)} n=${String(of.length).padStart(5)}  failed=${of.filter((r) => !r.ok).length}  `
    + `p50 ${fmt(pct(ms, 50))}  p95 ${fmt(pct(ms, 95))}  p99 ${fmt(pct(ms, 99))}  max ${fmt(ms.at(-1))}  `
    + `statuses ${JSON.stringify(byStatus)}`);
}
const windowResults = results.filter((r) => r.phase === 'window');
const windowSeconds = windowStartedAt ? (endedAt - windowStartedAt) / 1000 : NaN;
say();
say(`Requests in the ${DURATION_S} s window: ${windowResults.length} (${(windowResults.length / windowSeconds).toFixed(2)} requests/s)`);

const failed = results.filter((r) => !r.ok);
const serverErrors = results.filter((r) => r.status >= 500);
say();
say(`Failed requests      : ${failed.length}`);
say(`Unhandled server errors (5xx): ${serverErrors.length}`);
if (failed.length) {
  const kinds = {};
  for (const f of failed) kinds[`${f.kind}: ${f.error}`] = (kinds[`${f.kind}: ${f.error}`] ?? 0) + 1;
  say('Failures by type:');
  for (const [k, n] of Object.entries(kinds)) say(`  ${n} x ${k}`);
}
const pass = failed.length === 0 && serverErrors.length === 0 && Boolean(windowStartedAt);
say();
say(`RESULT ${pass ? 'PASS' : 'FAIL'}: NFR-2.4, ${USERS} concurrent authenticated users for ${DURATION_S} s: `
  + `${failed.length} failed requests, ${serverErrors.length} unhandled server errors`);

await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
await writeFile(args.out, `${lines.join('\n')}\n`);
process.exit(pass ? 0 : 1);

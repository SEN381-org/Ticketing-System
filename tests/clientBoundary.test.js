/**
 * Client/server boundary — DEC-014 (tier separation), DEC-019, FR-6.1, FR-1.2, TD-003.
 *
 * Basis: the thin client (client/) may share exactly one module with the server,
 * shared/domainValues.js. It must not reach into src/, and it must not carry its
 * own copy of a STATUS or ROLE value (DEC-019 §3; the M2 defect with
 * invented statuses and roles, AI Usage Register v0.12 row 48). DEC-019 makes
 * this test the BLOCKING gate for the client: it runs in `npm test`, so in CI.
 * The expected values are read from shared/domainValues.js itself, never
 * retyped here. The inputs below are deliberately chosen strings and files; the
 * expected result of each is stated beside it, derived from the rules above
 * before the test was run.
 *
 * Technique/level: static text scan (negative / structural), no database, no
 * client/node_modules. Two groups:
 *   - detector self-tests on fixed strings, so the scanners are shown to flag
 *     each syntax form they claim to cover and to ignore ordinary words;
 *   - repository scans of every .js/.jsx/.ts/.tsx/.mjs/.cjs file under
 *     client/src, recursively (client/node_modules is skipped; client/dist is
 *     outside client/src and is never read).
 *
 * What a pass shows:
 *   (1) no import, export-from, import() or require in client/src resolves into
 *       the server's src/ tree. Relative specifiers are RESOLVED with
 *       path.resolve, not string-matched, so a route through shared/ and back up
 *       into src/ is caught;
 *   (2) the only specifier leaving client/ resolves to shared/domainValues.js
 *       (bare package names such as react are allowed; ../../package.json and
 *       ../../shared/other.js are not), and at least one file uses it;
 *   (3) no STATUS or ROLE value appears inside a single-quoted, double-quoted or
 *       single-line template string, or as JSX text between tags.
 *
 * What a pass does NOT show:
 *   - that the client builds (npm --prefix client run build does) or behaves;
 *   - TD-003, that the client does no rule checking. A static scan cannot prove
 *     that and this file does not pretend to. It is left to E2E-1 step 3, where
 *     a transition POST must be OBSERVED with an empty reason (the server, not
 *     the client, refuses it). Those specs are held until PR #88 merges;
 *   - anything about computed specifiers (import(x), require(a + b)), URLs built
 *     at run time (new URL('../src', import.meta.url)), values assembled at run
 *     time, values in multi-line template literals, or files outside
 *     client/src (client/index.html, client/vite.config.js);
 *   - case-insensitive or partial matches: only the exact FR-6.1 / FR-1.2 text
 *     is searched for.
 *
 * JSX text decision: a component can write <option>Received</option> with no
 * quotes, so JSX text is scanned, whole-word and case-sensitive. At the time of
 * writing no client file uses any of the 13 values as ordinary UI text
 * ("Request", "Status", "Reference", "Sign in" do not collide), so there is no
 * false positive to accommodate. If a future label genuinely needs the word
 * (for example a heading "Closed requests"), the right fix is to render it from
 * the imported value, not to relax this scan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS, ROLE } from '../shared/domainValues.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'client');
const clientSrc = path.join(clientDir, 'src');
const serverSrc = path.join(root, 'src');
const sharedModule = path.join(root, 'shared', 'domainValues.js');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return /\.(js|jsx|mjs|cjs|ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = walk(clientSrc);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const inside = (child, parent) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/** Every static import/export-from, side-effect import, dynamic import and require specifier. */
function specifiersOf(text) {
  const found = [];
  const patterns = [
    /\bfrom\s*(['"`])([^'"`]+)\1/g,
    /\bimport\s*(['"`])([^'"`]+)\1/g,
    /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
    /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) found.push(m[2]);
  return found;
}

/** Relative or absolute specifiers only; bare names are packages and cannot reach src/ by path. */
const resolved = (file, spec) =>
  spec.startsWith('.') || path.isAbsolute(spec) ? path.resolve(path.dirname(file), spec) : null;

const values = [...Object.values(STATUS), ...Object.values(ROLE)];
const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Domain values found inside a one-line quoted/template string, or as JSX text between > and <. */
function domainValueHits(text) {
  const hits = [];
  for (const value of values) {
    const e = escape(value);
    const quoted = new RegExp(`(['"\`])[^'"\`\\n]*${e}[^'"\`\\n]*\\1`);
    // Text node: after a > and before the next <, containing no { } < >.
    // Whole-word, so "Requests" is not "Requester".
    const jsxText = new RegExp(`>[^<>{}]*(?<![A-Za-z])${e}(?![A-Za-z])[^<>{}]*<`);
    if (quoted.test(text)) hits.push({ value, form: 'string literal' });
    if (jsxText.test(text)) hits.push({ value, form: 'JSX text' });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Detector self-tests. Basis: the scanners are only evidence if they flag each
// form they claim to cover. Expected results are stated per fixture.

test('the value list is the 7 FR-6.1 statuses plus the 6 FR-1.2 roles', () => {
  assert.equal(Object.values(STATUS).length, 7);
  assert.equal(Object.values(ROLE).length, 6);
  assert.equal(values.length, 13);
});

test('detector: a domain value is flagged in single quotes, double quotes, a template literal and JSX text', () => {
  const fixtures = {
    'single quotes': "const a = 'Received';",
    'double quotes': 'const a = "In Progress";',
    'template literal': 'const a = `Security Officer`;',
    'embedded in a longer string': "const a = 'status is Closed now';",
    'JSX text': '<option>Rejected</option>',
    'JSX text with spaces': '<li> On Hold </li>',
    'JSX text, role': '<td>Coordinator</td>',
  };
  for (const [name, text] of Object.entries(fixtures)) {
    assert.ok(domainValueHits(text).length >= 1, `${name} was not flagged: ${text}`);
  }
});

test('detector: ordinary words and code are not flagged (no false positives)', () => {
  const clean = [
    '<h1>Request</h1>',
    '<p>Requests are listed</p>',
    '<p>Status: <span>{request.status}</span></p>',
    "const a = 'closed';",
    'const closed = x > 1 && y < 2;',
    '<option key={s} value={s}>{s}</option>',
    "import { STATUS } from '../../shared/domainValues.js';",
  ];
  for (const text of clean) {
    assert.deepEqual(domainValueHits(text), [], `false positive on: ${text}`);
  }
});

test('detector: specifiers are found for static, side-effect, export-from, dynamic and require forms', () => {
  const text = [
    "import a from '../x.js';",
    'import { b } from "../y.js";',
    "import '../z.css';",
    "export * from '../w.js';",
    "export { q } from '../v.js';",
    "const m = await import('../u.js');",
    "const n = require('../t.js');",
    "import r from 'react';",
  ].join('\n');
  assert.deepEqual(specifiersOf(text).sort(),
    ['../t.js', '../u.js', '../v.js', '../w.js', '../x.js', '../y.js', '../z.css', 'react'].sort());
});

test('detector: specifiers are resolved by path, so depth and a detour through shared/ cannot hide src/', () => {
  const at = path.join(clientSrc, 'a', 'b', 'f.jsx');
  const cases = [
    // [specifier, expected: does it land inside server src/ ?]
    ['../../../../src/app.js', true],
    ['../../../../shared/../src/app.js', true],
    ['../../../../shared/domainValues.js', false],
    ['../../x.js', false],
    ['react', null],
  ];
  for (const [spec, intoSrc] of cases) {
    const target = resolved(at, spec);
    if (intoSrc === null) assert.equal(target, null, spec);
    else assert.equal(inside(target, serverSrc), intoSrc, spec);
  }
  assert.equal(path.normalize(resolved(at, '../../../../shared/domainValues.js')), sharedModule);
  for (const spec of ['../../../../package.json', '../../../../shared/somethingElse.js']) {
    const target = resolved(at, spec);
    assert.ok(!inside(target, clientDir) && path.normalize(target) !== sharedModule, spec);
  }
});

// ---------------------------------------------------------------------------
// Repository scans.

test('the client has source files to check', () => {
  assert.ok(files.length >= 5, `expected client source files under client/src, found ${files.length}`);
});

test('no client/src file imports from the server src/ tree — DEC-014', () => {
  for (const file of files) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      const target = resolved(file, spec);
      if (target === null) continue;
      assert.ok(!inside(target, serverSrc),
        `${rel(file)} imports "${spec}", which resolves into the server src/ tree`);
    }
  }
});

test('the only import leaving client/ is shared/domainValues.js, and the client uses it — DEC-014', () => {
  let usedShared = 0;
  for (const file of files) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      const target = resolved(file, spec);
      if (target === null || inside(target, clientDir)) continue;
      assert.equal(path.normalize(target), sharedModule,
        `${rel(file)} imports "${spec}", which leaves client/ for something other than shared/domainValues.js`);
      usedShared += 1;
    }
  }
  assert.ok(usedShared >= 1, 'no client/src file imports shared/domainValues.js');
});

test('no client/src file holds a STATUS or ROLE value as a string literal or JSX text — FR-6.1, FR-1.2', () => {
  for (const file of files) {
    const hits = domainValueHits(readFileSync(file, 'utf8'));
    assert.deepEqual(hits, [],
      `${rel(file)} contains a domain value as ${hits.map((h) => `${h.form} "${h.value}"`).join(', ')}; import it from shared/domainValues.js`);
  }
});

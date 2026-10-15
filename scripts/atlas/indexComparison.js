/**
 * Pure logic for the index-provisioning script. Traces to: TD-004, DEC-003 v0.3 (deployment step 5),
 * DEF-014, DEF-015, DEF-017.
 *
 * No I/O in this file: nothing here reads a file, opens a connection or prints. The shell,
 * provision-indexes.js, does that and calls these functions, so every decision the script makes
 * (is this index present, is the grant acceptable, may this host be touched, is this command
 * allowed, what is the exit code) can be tested without a database.
 *
 * The comparator is written here on purpose. Mongoose's own index-equality helper is private
 * and its idea of "equal" is not ours: this one fails closed. An option it does not know how to
 * compare, on either side, is a DIFFERENCE, never an assumed match.
 */

import { CLUSTER_MARKERS } from '../lib/clusterMarkers.js';

export const DATABASE = 'civicconnect';
/** The user name is in DEC-003 v0.3. The role name is not recorded yet, so it is deliberately not here. */
export const EXPECTED_USER = 'civicconnect-temp-provisioner';
export const ENVIRONMENTS = Object.freeze(['test', 'staging', 'production']);
export const ALLOWED_ACTIONS = Object.freeze(['createIndex', 'listIndexes']);

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

/** Declared-side options that mean nothing on the server. */
const DECLARED_IGNORED = new Set(['background', '_autoIndex']);
/** Server-side fields that are bookkeeping, not options. */
const SERVER_IGNORED = new Set(['v', 'ns', 'background', 'textIndexVersion', '2dsphereIndexVersion']);
/** Options the comparator understands. Anything else is reported, never assumed equal. */
const COMPARED_OPTIONS = new Set([
  'unique', 'sparse', 'hidden', 'partialFilterExpression', 'expireAfterSeconds',
  'weights', 'default_language', 'language_override',
]);
const TEXT_DEFAULT_LANGUAGE = 'english';
const TEXT_DEFAULT_LANGUAGE_OVERRIDE = 'language';

/**
 * Text indexes are stored as { _fts: 'text', _ftsx: 1 } with the fields in `weights`. The key is
 * collapsed at the position of the first text field so that a declared and a stored text index
 * compare on the same footing.
 */
function collapseKey(entries) {
  const key = [];
  const textFields = [];
  let inserted = false;
  for (const [field, direction] of entries) {
    if (direction === 'text') {
      textFields.push(field);
      if (!inserted) {
        key.push(['_fts', 'text'], ['_ftsx', 1]);
        inserted = true;
      }
    } else {
      key.push([field, direction]);
    }
  }
  return { key, textFields };
}

/** The driver's default index name: field_direction joined by underscores. */
function defaultName(entries) {
  return entries.map(([field, direction]) => `${field}_${direction}`).join('_');
}

export function keyId(key) {
  return JSON.stringify(key);
}

export function formatKey(key) {
  return `{ ${key.map(([field, direction]) => `${field}: ${typeof direction === 'string' ? `'${direction}'` : direction}`).join(', ')} }`;
}

/**
 * One declared index, from Model.schema.indexes() as [fields, options], to the comparable form.
 * `extra` lists the option names this comparator does not understand.
 */
export function normaliseDeclared(collection, [fields, options = {}]) {
  const entries = Object.entries(fields);
  const { key, textFields } = collapseKey(entries);
  const isText = textFields.length > 0;
  const extra = Object.keys(options)
    .filter((name) => name !== 'name' && !DECLARED_IGNORED.has(name) && !COMPARED_OPTIONS.has(name) && options[name] !== undefined);
  const spec = {
    collection,
    key,
    name: options.name ?? defaultName(entries),
    unique: options.unique === true,
    sparse: options.sparse === true,
    hidden: options.hidden === true,
    partialFilterExpression: options.partialFilterExpression,
    expireAfterSeconds: options.expireAfterSeconds,
    isText,
    extra,
  };
  if (isText) {
    spec.weights = { ...Object.fromEntries(textFields.map((field) => [field, 1])), ...(options.weights ?? {}) };
    spec.default_language = options.default_language ?? TEXT_DEFAULT_LANGUAGE;
    spec.language_override = options.language_override ?? TEXT_DEFAULT_LANGUAGE_OVERRIDE;
  } else {
    // weights / language options on a non-text index are not understood: report them.
    for (const name of ['weights', 'default_language', 'language_override']) {
      if (options[name] !== undefined) extra.push(name);
    }
  }
  return spec;
}

/** One index document from listIndexes to the comparable form. */
export function normalisePresent(collection, index) {
  const entries = Object.entries(index.key ?? {});
  const isText = entries.some(([field, direction]) => field === '_fts' && direction === 'text');
  const extra = Object.keys(index)
    .filter((name) => !['key', 'name'].includes(name) && !SERVER_IGNORED.has(name) && !COMPARED_OPTIONS.has(name) && index[name] !== undefined);
  const spec = {
    collection,
    key: entries,
    name: index.name,
    unique: index.unique === true,
    sparse: index.sparse === true,
    hidden: index.hidden === true,
    partialFilterExpression: index.partialFilterExpression,
    expireAfterSeconds: index.expireAfterSeconds,
    isText,
    extra,
  };
  if (isText) {
    spec.weights = index.weights ?? {};
    spec.default_language = index.default_language ?? TEXT_DEFAULT_LANGUAGE;
    spec.language_override = index.language_override ?? TEXT_DEFAULT_LANGUAGE_OVERRIDE;
  } else {
    for (const name of ['weights', 'default_language', 'language_override']) {
      if (index[name] !== undefined) extra.push(name);
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------

/** Structural equality; object key order does not matter, array order does, numbers by value. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

export function formatValue(value) {
  return value === undefined ? '(absent)' : JSON.stringify(value);
}

/** The differences between a declared and a stored index that share a key. Empty means they match. */
export function compareSpecs(declared, present) {
  const differences = [];
  const note = (field, d, p) => differences.push({ field, declared: d, present: p });

  if (declared.name !== present.name) note('name', declared.name, present.name);
  for (const flag of ['unique', 'sparse', 'hidden']) {
    if (declared[flag] !== present[flag]) note(flag, declared[flag], present[flag]);
  }
  if (!deepEqual(declared.partialFilterExpression, present.partialFilterExpression)) {
    note('partialFilterExpression', declared.partialFilterExpression, present.partialFilterExpression);
  }
  const ttlD = declared.expireAfterSeconds;
  const ttlP = present.expireAfterSeconds;
  const ttlSame = (ttlD === undefined || ttlP === undefined) ? ttlD === ttlP : Number(ttlD) === Number(ttlP);
  if (!ttlSame) note('expireAfterSeconds', ttlD, ttlP);
  if (declared.isText && present.isText) {
    if (!deepEqual(declared.weights, present.weights)) note('weights', declared.weights, present.weights);
    for (const name of ['default_language', 'language_override']) {
      if (declared[name] !== present[name]) note(name, declared[name], present[name]);
    }
  }
  for (const name of new Set([...declared.extra, ...present.extra])) {
    note(`uncompared option ${name}`, declared.extra.includes(name) ? 'declared' : undefined, present.extra.includes(name) ? 'present' : undefined);
  }
  return differences;
}

/**
 * Classify every declared index against what the server lists.
 *
 * @param declared     [{ collection, indexes: [[fields, options], ...] }]
 * @param presentByCollection  Map collection -> array of listIndexes documents, or null when the
 *                     collection does not exist (NamespaceNotFound, which is not an error)
 * @param errors       Map `${collection}/${declaredName}` -> { code, codeName, message }
 * @returns { entries, undeclared }  entries: PRESENT | DIFFERENT | MISSING, undeclared: server
 *          indexes (other than _id_) that no declared index accounts for
 */
export function classify(declared, presentByCollection, errors = new Map()) {
  const entries = [];
  const undeclared = [];
  const collections = [...declared].sort((a, b) => (a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : 0));

  for (const { collection, indexes } of collections) {
    const stored = (presentByCollection.get(collection) ?? [])
      .filter((ix) => ix.name !== '_id_')
      .map((ix) => normalisePresent(collection, ix));
    const claimed = new Set();

    for (const raw of indexes) {
      const spec = normaliseDeclared(collection, raw);
      const sameKey = stored.filter((s) => keyId(s.key) === keyId(spec.key) && !claimed.has(s));
      const match = sameKey.find((s) => s.name === spec.name) ?? sameKey[0];
      const error = errors.get(`${collection}/${spec.name}`);
      if (!match) {
        entries.push({ collection, name: spec.name, key: spec.key, status: 'MISSING', differences: [], error });
        continue;
      }
      claimed.add(match);
      const differences = compareSpecs(spec, match);
      entries.push({
        collection, name: spec.name, key: spec.key, status: differences.length ? 'DIFFERENT' : 'PRESENT', differences, error,
      });
    }
    for (const s of stored) {
      if (!claimed.has(s)) undeclared.push({ collection, name: s.name, key: s.key });
    }
  }
  return { entries, undeclared };
}

/** The last line of the report and the exit code that goes with it (0 pass, 1 comparison failed). */
export function summarise({ entries, undeclared }) {
  const count = (status) => entries.filter((e) => e.status === status).length;
  const present = count('PRESENT');
  const missing = count('MISSING');
  const different = count('DIFFERENT');
  const failed = missing > 0 || different > 0 || undeclared.length > 0;
  return {
    present, missing, different, undeclared: undeclared.length, declared: entries.length,
    exitCode: failed ? 1 : 0,
    line: `RESULT ${failed ? 'FAIL' : 'PASS'}: ${present} of ${entries.length} declared indexes present with matching options `
      + `(missing ${missing}, different ${different}, undeclared ${undeclared.length})`,
  };
}

/** The comparison section of the report, per collection A-Z, indexes in schema order. */
export function formatComparison({ entries, undeclared }, redact = (s) => s) {
  const lines = [];
  let current = null;
  for (const e of entries) {
    if (e.collection !== current) {
      current = e.collection;
      lines.push(`  ${current}`);
    }
    lines.push(`    ${e.status.padEnd(9)} ${e.name}  ${formatKey(e.key)}`);
    for (const d of e.differences) {
      lines.push(`              ${d.field}: declared ${formatValue(d.declared)}, present ${formatValue(d.present)}`);
    }
    if (e.error) lines.push(`              createIndexes error: ${describeError(e.error, redact)}`);
  }
  for (const u of undeclared) {
    lines.push(`    UNDECLARED ${u.collection}.${u.name}  ${formatKey(u.key)}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Privilege self-check (DEC-003 v0.3 grants createIndex and listIndexes, per declared collection)
// ---------------------------------------------------------------------------------------------

function describeResource(resource) {
  if (resource.anyResource) return 'anyResource';
  if (resource.cluster) return 'cluster';
  return `${resource.db || '(any database)'} / ${resource.collection || '(any collection)'}`;
}

/**
 * Judge the connectionStatus authInfo the server reports for the connection. Accepts exactly:
 * the one expected user; actions within { createIndex, listIndexes }; resources that are the
 * database `civicconnect` and one declared collection each; both actions on every declared
 * collection. Everything else, including a database-wide grant, is a problem, and each problem
 * names the offending grant.
 *
 * createCollection is not accepted: createIndexes creates an absent collection on its own with
 * createIndex alone (probe of 2026-10-13, decision D2).
 */
export function checkPrivileges(authInfo, { collections, database = DATABASE, expectedUser = EXPECTED_USER }) {
  const problems = [];
  const users = (authInfo?.authenticatedUsers ?? []).map((u) => u.user);
  if (users.length !== 1 || users[0] !== expectedUser) {
    problems.push(`authenticated as ${users.length ? users.join(', ') : '(nobody)'}, expected only ${expectedUser}`);
  }

  const declared = new Set(collections);
  const covered = new Map(collections.map((c) => [c, new Set()]));
  for (const p of authInfo?.authenticatedUserPrivileges ?? []) {
    const r = p.resource ?? {};
    const where = describeResource(r);
    const actions = p.actions ?? [];
    const extraActions = actions.filter((a) => !ALLOWED_ACTIONS.includes(a));
    if (extraActions.length) problems.push(`grant on ${where} carries not-permitted action(s): ${extraActions.join(', ')}`);
    if (r.anyResource || r.cluster) {
      problems.push(`grant on ${where} is not a collection of ${database}`);
      continue;
    }
    if (r.db !== database) {
      problems.push(`grant on ${where} is on a database other than ${database}`);
      continue;
    }
    if (!r.collection) {
      problems.push(`grant on ${where} is database-wide; grants must name declared collections`);
      continue;
    }
    if (!declared.has(r.collection)) {
      problems.push(`grant on ${where} names a collection that is not declared`);
      continue;
    }
    for (const a of actions) if (ALLOWED_ACTIONS.includes(a)) covered.get(r.collection).add(a);
  }
  for (const [collection, actions] of covered) {
    for (const a of ALLOWED_ACTIONS) {
      if (!actions.has(a)) problems.push(`${a} is not granted on ${database} / ${collection}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------
// Host guard
// ---------------------------------------------------------------------------------------------

/**
 * May this script touch the cluster named by `uri` for environment `env`? Only the host of the
 * URI is examined (the harness rule): a user name, database or option containing the marker does
 * not satisfy it. The marker comes from the recorded map, never from the command line. The reason
 * never contains the URI.
 */
export function checkTarget({ uri, env, markers = CLUSTER_MARKERS, database = DATABASE }) {
  if (!ENVIRONMENTS.includes(env)) {
    return { ok: false, reason: `--env is required and must be one of ${ENVIRONMENTS.join(', ')}` };
  }
  const marker = markers[env];
  if (!marker) {
    return { ok: false, reason: `no host marker is recorded in DEC-003 for the ${env} environment; refusing` };
  }
  if (!uri) return { ok: false, reason: 'MONGODB_URI is not set' };
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) return { ok: false, reason: 'MONGODB_URI is not a mongodb:// or mongodb+srv:// connection string' };
  let url;
  try {
    url = new URL(uri);
  } catch {
    return { ok: false, reason: 'MONGODB_URI could not be parsed to find its host; refusing' };
  }
  if (!url.hostname.includes(marker)) {
    return { ok: false, reason: `the host in MONGODB_URI does not contain the recorded ${env} marker; refusing to connect` };
  }
  let path;
  try {
    path = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return { ok: false, reason: 'the database in MONGODB_URI could not be read; refusing' };
  }
  if (path !== database) {
    return { ok: false, reason: `the database in MONGODB_URI is not ${database}; refusing` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------------------------

/**
 * A function that removes everything that must not reach a transcript: the URI, its host, user
 * name and password, any *.mongodb.net name, any connection string, and the `dup key: { ... }`
 * clause of an E11000 (it would carry the offending value, e.g. an email address).
 */
export function makeRedactor(uri) {
  let secrets = [];
  try {
    const u = new URL(uri);
    secrets = [uri, u.hostname, decodeURIComponent(u.username), decodeURIComponent(u.password)];
  } catch {
    secrets = [uri];
  }
  secrets = secrets.filter((s) => s && s.length > 2).sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    for (const s of secrets) out = out.split(s).join('[redacted]');
    return out
      .replace(/[A-Za-z0-9._-]*mongodb\.net(:\d+)?/g, '[redacted-host]')
      .replace(/mongodb(\+srv)?:\/\/\S+/g, '[redacted-uri]')
      .replace(/dup key: \{.*\}/g, 'dup key: [removed]');
  };
}

/** `code N codeName: message`, redacted. */
export function describeError(err, redact) {
  const code = err.code !== undefined ? `code ${err.code}` : 'no code';
  const name = err.codeName ? ` ${err.codeName}` : '';
  return `${code}${name}: ${redact(err.errmsg || err.message || String(err))}`;
}

// ---------------------------------------------------------------------------------------------
// Command allow-list
// ---------------------------------------------------------------------------------------------

/**
 * The only commands the script may send. The handshake and authentication commands are the
 * driver's own; the exact set it uses is to be confirmed on the first real run (a command outside
 * this list aborts the run with exit 2, so a missing handshake command shows up immediately and
 * safely). Nothing that reads or writes documents, drops, or modifies is on the list.
 * createIndexes is on it only when the run is not --check-only.
 */
const ALLOWED_COMMANDS = new Set([
  'hello', 'isMaster', 'ismaster', 'ping', 'saslStart', 'saslContinue', 'authenticate',
  'connectionStatus', 'buildInfo', 'listIndexes', 'getMore', 'killCursors', 'endSessions',
]);

export function isCommandAllowed(commandName, { checkOnly = false } = {}) {
  if (commandName === 'createIndexes') return !checkOnly;
  return ALLOWED_COMMANDS.has(commandName);
}

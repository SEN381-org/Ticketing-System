/**
 * Readable, redacted MongoDB errors for the perf scripts.
 *
 * A MongoBulkWriteError's own message is often just a summary; the reason is in its nested
 * writeErrors (and, for an Atlas refusal, in errmsg, e.g. "user is not allowed to do action
 * [insert] on [civicconnect.users]"). This prints those. It removes what must not reach a
 * transcript: connection strings, *.mongodb.net hosts and the "dup key: { ... }" clause of an
 * E11000, which would carry the duplicated value (for example an email address).
 */

export function redact(text) {
  return String(text)
    .replace(/mongodb(\+srv)?:\/\/\S+/g, '[redacted-uri]')
    .replace(/[A-Za-z0-9._-]*mongodb\.net(:\d+)?/g, '[redacted-host]')
    .replace(/dup key: \{.*?\}/g, 'dup key: [removed]');
}

/** @returns {string[]} lines describing the error and up to `limit` nested write errors */
export function describeMongoError(e, limit = 5) {
  const lines = [];
  const name = e?.codeName ? ` ${e.codeName}` : '';
  lines.push(`${e?.name ?? 'Error'}: code ${e?.code ?? '-'}${name}: ${redact(e?.errmsg ?? e?.message ?? e)}`);
  const writeErrors = Array.isArray(e?.writeErrors) ? e.writeErrors : (e?.writeErrors ? [e.writeErrors] : []);
  for (const w of writeErrors.slice(0, limit)) {
    lines.push(`  writeError index ${w.index ?? '-'}: code ${w.code ?? '-'}: ${redact(w.errmsg ?? w.err?.errmsg ?? w.message ?? '')}`);
  }
  if (writeErrors.length > limit) lines.push(`  ... ${writeErrors.length - limit} more write errors`);
  const inserted = e?.insertedCount ?? e?.result?.insertedCount;
  if (inserted !== undefined) lines.push(`  inserted by this command before the error: ${inserted}`);
  return lines;
}

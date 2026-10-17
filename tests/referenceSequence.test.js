/**
 * Request reference sequence — one per UTC year, not per campus.
 *
 * Traces to: FR-2.6, AC-FR-2.6, DB-01 §3.8 (`counters`), DEC-016.
 *
 * FR-2.6 makes the reference unique across ALL requests, and CC-yyyy-nnnnnn
 * carries no campus. A counter keyed per campus would issue CC-2026-000001 to
 * the first request of every campus, and the second insert would hit the unique
 * index `reference_1`. Found at integration, not in the submission track's own
 * tests, because those use a single campus.
 *
 * The real counterRepository and the real submission service are used. Only the
 * Counter model's findOneAndUpdate is replaced by an in-memory `$inc` upsert, and
 * the fake request store enforces the unique reference, as the index does.
 *
 * What this does NOT show: the `$inc` against a real cluster or under concurrent
 * load; only that the key contains no campus.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import Counter from '../src/models/Counter.js';
import { counterRepository } from '../src/repositories/counterRepository.js';
import { createRequestSubmissionService } from '../src/services/requestSubmissionService.js';
import { ROLE } from '../src/models/_shared.js';

const NOW = new Date('2026-10-17T08:30:00.000Z');
const CAMPUS_A = 'campus-a';
const CAMPUS_B = 'campus-b';
const CAT_A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const CAT_B = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const BODY = { location: 'Main Street', description: 'Pothole' };

function build() {
  const seqs = new Map();
  const stored = [];
  const original = Counter.findOneAndUpdate;
  Counter.findOneAndUpdate = (filter) => ({
    lean: async () => {
      const seq = (seqs.get(filter._id) ?? 0) + 1;
      seqs.set(filter._id, seq);
      return { _id: filter._id, seq };
    },
  });
  const restore = () => { Counter.findOneAndUpdate = original; };

  const actors = {
    a: { id: 'user-a', roles: [ROLE.REQUESTER], campusId: CAMPUS_A },
    b: { id: 'user-b', roles: [ROLE.REQUESTER], campusId: CAMPUS_B },
  };
  const service = createRequestSubmissionService({
    requests: {
      create: async (doc) => {
        if (stored.some((r) => r.reference === doc.reference)) {
          throw new Error(`E11000 duplicate key: reference_1 ${doc.reference}`);
        }
        stored.push(doc);
        return { ...doc, _id: `req-${stored.length}` };
      },
    },
    history: { findByIdempotencyKey: async () => null, append: async () => ({ _id: 'h' }) },
    categories: {
      findActiveById: async (campusId, id) =>
        ({ _id: id, campusId, isSecurity: false, active: true }),
    },
    counters: counterRepository,
    unitOfWork: { run: async (work) => work({}) },
    clock: () => NOW,
  });
  return { service, actors, stored, seqs, restore };
}

test('AC-FR-2.6, FR-2.6: submissions from two campuses in the same year get different references', async () => {
  const t = build();
  try {
    const first = await t.service.submit(t.actors.a, { categoryId: CAT_A, ...BODY },
      { idempotencyKey: 'k1', fingerprint: 'f1' });
    const second = await t.service.submit(t.actors.b, { categoryId: CAT_B, ...BODY },
      { idempotencyKey: 'k2', fingerprint: 'f2' });

    assert.equal(first.result.reference, 'CC-2026-000001');
    assert.equal(second.result.reference, 'CC-2026-000002');
    assert.equal(new Set(t.stored.map((r) => r.reference)).size, 2, 'unique across all requests');
    assert.deepEqual([...t.seqs.keys()], ['request-ref:2026'], 'one sequence per year, no campus in the key');
    assert.deepEqual(t.stored.map((r) => r.campusId), [CAMPUS_A, CAMPUS_B]);
  } finally {
    t.restore();
  }
});

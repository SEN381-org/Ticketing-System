/**
 * E2E-2: a Technician sends a Rejected transition straight to the server, bypassing the UI.
 *
 * Basis: FR-6.4 / AC-FR-6.4, NFR-3.3 / AC-NFR-3.3 ("invoked directly against the server
 * interface, bypassing the user interface"), FR-1.3 / AC-FR-1.3 first two clauses (the
 * recording clause is not built and is not asserted), DEC-015 §4 (403 row: FR-1.3, FR-6.4,
 * NFR-3.3). Case: DEC-019 (Context); expected failure: DEC-019 §2, DEF-011.
 *
 * The fixture user is authorised for the request's category on purpose, and the GET is
 * asserted 200 first, so only the transition role rule can refuse.
 *
 * E2E-2a (passes today): refused, nothing disclosed, nothing written. It carries the
 * refusal assertions as an ordinary test because test.fail() is satisfied by ANY failure.
 * E2E-2b: DEC-015 §4 requires 403 FORBIDDEN. Until M4 the code returned 422 (DEF-011) and
 * the test carried a test.fail mark. DEF-011 is fixed at M4 and the mark is removed; the
 * 403 assertion itself was never changed.
 *
 * Does NOT show: that a Coordinator is allowed, the recording of the refused attempt
 * (AC-FR-1.3), or any role other than Technician.
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, createFixture, snapshot, newKey, leafValues } from './support/cluster.js';
import { openSignedOut, signInViaForm, expectNoRequestData } from './support/ui.js';

const PROBLEM_JSON = /^application\/problem\+json/i;

useCluster();

/** Fixture, UI sign-in, precondition read, then the bypassing POST. */
async function technicianPostsRejected(page, label) {
  const fixture = await createFixture({ roles: [ROLE.TECHNICIAN] });
  const { requestId } = fixture;
  const reason = `${label} ${fixture.email} ${Date.now()}`;

  await openSignedOut(page, requestId);
  const { get } = await signInViaForm(page, requestId, fixture);
  expect(get.status()).toBe(200); // precondition: category authorisation passes, so a refusal below is the role rule
  const etag = get.headers().etag;

  const response = await page.request.post(`/api/v1/requests/${requestId}/transitions`, {
    headers: { 'If-Match': etag, 'Idempotency-Key': newKey() },
    data: { toStatus: STATUS.REJECTED, reason },
  });
  return { fixture, requestId, response };
}

test('E2E-2a: a Technician cannot reject a request, and nothing is written', async ({ page }) => {
  const { fixture, requestId, response } = await technicianPostsRejected(page, 'e2e-2a');

  expect(response.status()).toBeGreaterThanOrEqual(400);   // AC-FR-6.4, AC-NFR-3.3
  expect(response.headers()['content-type']).toMatch(PROBLEM_JSON);
  const body = await response.json();
  expectNoRequestData(body, response.status());
  expect(leafValues(body)).not.toContain(fixture.request.reference);

  const after = await snapshot(requestId);                 // RTM FR-6.2: a refused transition writes nothing
  expect(after.request.status).toBe(STATUS.RECEIVED);
  expect(after.request.version).toBe(0);
  expect(after.request.closure?.reason ?? null).toBeNull();
  expect(after.history).toHaveLength(0);

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText(STATUS.RECEIVED);
});

test('E2E-2b: the wrong-role refusal is 403 FORBIDDEN (DEC-015 §4)', async ({ page }) => {
  const { response } = await technicianPostsRejected(page, 'e2e-2b');

  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('FORBIDDEN');
});

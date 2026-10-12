/**
 * E2E-1: a Coordinator rejects a Received request, in a real Chromium session.
 *
 * Basis: FR-1.1 / AC-FR-1.1 (detail address only), FR-6.6 / AC-FR-6.6 (refusal and
 * store-the-reason clauses only), FR-6.3 / AC-FR-6.3, DEC-015 §2-4 (ETag / If-Match,
 * Idempotency-Key, 422 and 428 rows, problem details), DEC-018 §3-5 (__Host-sid cookie,
 * 401 UNAUTHENTICATED, DELETE /sessions/current 204). Plan: .claude/notes/m3-client-e2e-plan.md §2.
 *
 * Expected results were taken from those sources before the first run, not from observed output.
 *
 * Shows: the cookie round trip through the composed entry point (src/server.js) and a fresh
 * client build; the sign-in prompt shown in place; the read path returning exactly
 * {reference, status, version} from the requests collection (the NV-43 check); If-Match taken
 * from the server's ETag; the server, not the client, refusing a missing reason; the history
 * entry checked field by field.
 *
 * Does NOT show: that the history is displayed (AC-FR-6.6 "displays it in the history"); any
 * list address; atomicity; replay or indexes; the audit trigger, idle expiry or refusal of
 * plain HTTP; non-Chromium browsers; FR-4.2 (the endpoint returns three fields only).
 * Assertions are scoped to this fixture's requestId and actorId (DEF-006): no counts.
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, createFixture, snapshot, leafValues } from './support/cluster.js';
import { openSignedOut, signInViaForm, isGet, isTransition, expectNoRequestData } from './support/ui.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROBLEM_JSON = /^application\/problem\+json/i;

useCluster();

test('E2E-1: Coordinator rejects a Received request', async ({ page, playwright, baseURL }) => {
  const fixture = await createFixture({ roles: [ROLE.COORDINATOR] });
  const { requestId } = fixture;
  const reference = fixture.request.reference;
  const reason = `e2e-1 ${fixture.email} ${Date.now()}`;
  const startedAt = Date.now();

  await test.step('1. signed out: prompt shown in place, nothing disclosed', async () => {
    const get = await openSignedOut(page, requestId); // AC-FR-1.1 Then
    expect(get.status()).toBe(401);                    // DEC-015 §4, DEC-018 §4
    expect(get.headers()['content-type']).toMatch(PROBLEM_JSON);
    const body = await get.json();
    expect(body.code).toBe('UNAUTHENTICATED');
    expectNoRequestData(body, 401);

    await expect(page).toHaveURL(`/requests/${requestId}`); // URL unchanged
    await expect(page.getByTestId('reference')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(reference);

    // The same address with no cookie at all, outside the browser's session.
    const bare = await playwright.request.newContext({ baseURL });
    try {
      const direct = await bare.get(`/api/v1/requests/${requestId}`);
      expect(direct.status()).toBe(401);
      expect(direct.headers()['content-type']).toMatch(PROBLEM_JSON);
      const directBody = await direct.json();
      expect(directBody.code).toBe('UNAUTHENTICATED');
      expectNoRequestData(directBody, 401);
    } finally {
      await bare.dispose();
    }
  });

  let etag;
  await test.step('2. sign in: the read returns exactly {reference, status, version} (NV-43)', async () => {
    const { signIn, get } = await signInViaForm(page, requestId, fixture);
    expect(signIn.status()).toBe(201);                 // DEC-018 §5
    expect(get.status()).toBe(200);
    etag = get.headers().etag;
    expect(etag).toBe('"v0"');                         // DEC-015 §2: ETag "v<version>"
    expect(await get.json()).toEqual({ reference, status: STATUS.RECEIVED, version: 0 });
    await expect(page.getByTestId('reference')).toHaveText(reference);
    await expect(page.getByTestId('status')).toHaveText(STATUS.RECEIVED);
  });

  await test.step('3. Rejected with no reason: the server refuses and nothing is written', async () => {
    await page.getByLabel('New status').selectOption(STATUS.REJECTED);
    await page.getByLabel('Reason').fill('');
    // If the client validated instead of sending, no response arrives and this wait fails the test (TD-003).
    const [response] = await Promise.all([
      page.waitForResponse(isTransition(requestId)),
      page.getByRole('button', { name: 'Submit transition' }).click(),
    ]);
    expect(response.status()).toBe(422);               // DEC-015 §4 row 422; AC-FR-6.6 first attempt refused
    expect((await response.json()).code).toBe('INVALID_TRANSITION');
    await expect(page.getByRole('alert')).toContainText('INVALID_TRANSITION');

    const after = await snapshot(requestId);           // RTM FR-6.2: a refused transition writes nothing
    expect(after.request.status).toBe(STATUS.RECEIVED);
    expect(after.request.version).toBe(0);
    expect(after.request.closure?.reason ?? null).toBeNull();
    expect(after.history).toHaveLength(0);
  });

  await test.step('4. Rejected with a reason: stored, versioned, one history entry', async () => {
    await page.getByLabel('Reason').fill(reason);
    const [request, response] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/v1/requests/${requestId}/transitions`),
      page.waitForResponse(isTransition(requestId)),
      page.getByRole('button', { name: 'Submit transition' }).click(),
    ]);
    const headers = request.headers();
    expect(headers['if-match']).toBe(etag);            // DEC-015 §2: the server's ETag, verbatim
    expect(headers['idempotency-key']).toMatch(UUID_V4); // DEC-015 §3
    expect(response.status()).toBe(201);
    expect(response.headers().etag).toBe('"v1"');
    await expect(page.getByTestId('status')).toHaveText(STATUS.REJECTED); // the re-read

    const after = await snapshot(requestId);
    expect(after.request.status).toBe(STATUS.REJECTED);
    expect(after.request.version).toBe(1);
    expect(after.request.closure.reason).toBe(reason); // AC-FR-6.6 stores the reason
    expect(after.history).toHaveLength(1);             // AC-FR-6.3
    const [entry] = after.history;
    expect(entry.actorId).toBe(String(fixture.user._id));
    expect(entry.actorRole).toBe(ROLE.COORDINATOR);
    expect(entry.fromStatus).toBe(STATUS.RECEIVED);
    expect(entry.toStatus).toBe(STATUS.REJECTED);
    expect(entry.body).toBe(reason);
    expect(entry.requestVersion).toBe(1);
    expect(entry.idempotencyKey).toBe(headers['idempotency-key']);
    const occurredAt = Date.parse(entry.occurredAt);
    expect(occurredAt).toBeGreaterThanOrEqual(startedAt);
    expect(occurredAt).toBeLessThanOrEqual(Date.now());
  });

  await test.step('5. sign out: session ended, nothing disclosed after reload', async () => {
    const [del] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === '/api/v1/sessions/current'),
      page.getByRole('button', { name: 'Sign out' }).click(),
    ]);
    expect(del.status()).toBe(204);                    // DEC-018 §5
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const [get] = await Promise.all([page.waitForResponse(isGet(requestId)), page.reload()]);
    expect(get.status()).toBe(401);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByTestId('reference')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(reference);
    expect(leafValues(await get.json())).not.toContain(reference);
  });
});

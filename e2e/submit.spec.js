/**
 * E2E-3: a Requester submits a request, in a real Chromium session.
 *
 * Basis: AC-FR-2.1 and AC-FR-2.6 (a stored submission is confirmed with its
 * reference, CC-yyyy-nnnnnn), AC-FR-2.2b (a missing mandatory field is named and
 * nothing is stored), AC-FR-2.5 (status Received, requester recorded, one
 * 'created' history entry), AC-FR-3.1 and AC-FR-3.2 (the Requester's list shows
 * the request with its status), AC-NFR-4.3 (a privacy notice before submit),
 * FR-2.2 (exactly three mandatory fields: category, location, description).
 * Case: DEC-019 (Context).
 *
 * Expected results, written before the first run from those sources:
 *  1. Signed in as a Requester on /requests/new, the privacy notice is on the
 *     page (presence only; the wording is a placeholder awaiting approval).
 *  2. Category and location filled, description empty: the server answers 400,
 *     the description field carries the server's message ('description' is
 *     required) as its accessible description and is marked invalid; the
 *     confirmation is not shown; the Requester has no stored request.
 *  3. All three filled: the server answers 201; the confirmation shows a
 *     reference matching ^CC-\d{4}-\d{6}$ with the current UTC year.
 *  4. Server truth: exactly one request for this Requester; its reference is the
 *     one shown; status Received; requesterId and submittedById are the user;
 *     category, location and description are the typed values; one history entry,
 *     changeType 'created', toStatus Received, actor the user, role Requester.
 *  5. My requests lists a link containing that reference and the status Received.
 *
 * Shows: the submission form, the server's 400 and 201 and what they stored, the
 * confirmation, the list, through the built client against the real server.
 * Does NOT show: the privacy notice wording (AC-NFR-4.3 needs approved text:
 * "who may access" is open); a security-category submission; a Coordinator
 * submitting on someone's behalf; that the reference counter has no gaps; atomicity
 * of the request and its history entry (integration case, not this journey);
 * non-Chromium browsers (AC-NFR-1.1). Assertions are scoped to this fixture's
 * campus and users, so earlier runs do not count (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, snapshot } from './support/cluster.js';
import { createCampus, addUser, requestsOf, BRIEF_CATEGORY_NAME } from './support/campus.js';
import { openSession, goAs, isPost } from './support/session.js';

const REFERENCE = /^CC-\d{4}-\d{6}$/;

useCluster();

test('E2E-3: Requester submits a request (AC-FR-2.1, AC-FR-2.2b, AC-FR-2.5, AC-FR-2.6, AC-FR-3.1, AC-FR-3.2, AC-NFR-4.3)', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const location = `E2E ${campus.runId} loading dock`;
  const description = `E2E ${campus.runId} the roller door will not close`;
  const { context, page } = await openSession(browser, baseURL);

  try {
    await test.step('1. sign in on the form; the privacy notice is on the page (AC-NFR-4.3)', async () => {
      await goAs(page, '/requests/new', requester);
      await expect(page.getByRole('radio', { name: BRIEF_CATEGORY_NAME })).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Privacy notice' })).toBeVisible();
    });

    await test.step('2. description empty: field error shown, nothing stored (AC-FR-2.2b)', async () => {
      await page.getByRole('radio', { name: BRIEF_CATEGORY_NAME }).check();
      await page.getByLabel('Location').fill(location);
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests')),
        page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe('INVALID_REQUEST');

      const field = page.getByLabel('Description');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAccessibleDescription(/'description' is required/);
      await expect(page.getByTestId('submitted-reference')).toHaveCount(0);
      expect(await requestsOf(requester.user)).toHaveLength(0);
    });

    let reference;
    await test.step('3. all three fields: confirmation shows the reference (AC-FR-2.1, AC-FR-2.6)', async () => {
      await page.getByLabel('Description').fill(description);
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests')),
        page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      expect(response.status()).toBe(201);
      const confirmation = page.getByTestId('submitted-reference');
      await expect(confirmation).toHaveText(REFERENCE);
      reference = (await confirmation.textContent()).trim();
      expect(reference.startsWith(`CC-${new Date().getUTCFullYear()}-`)).toBe(true);
    });

    await test.step('4. server truth: one request, Received, one created entry (AC-FR-2.5)', async () => {
      const stored = await requestsOf(requester.user);
      expect(stored).toHaveLength(1);
      const [request] = stored;
      expect(request.reference).toBe(reference);
      expect(request.status).toBe(STATUS.RECEIVED);
      expect(request.requesterId).toBe(requester.id);
      expect(request.submittedById).toBe(requester.id);
      expect(request.categoryId).toBe(String(campus.categoryId));
      expect(request.location).toBe(location);
      expect(request.description).toBe(description);

      const { history } = await snapshot(request._id);
      expect(history).toHaveLength(1);
      const [entry] = history;
      expect(entry.changeType).toBe('created');
      expect(entry.toStatus).toBe(STATUS.RECEIVED);
      expect(entry.actorId).toBe(requester.id);
      expect(entry.actorRole).toBe(ROLE.REQUESTER);
    });

    await test.step('5. My requests lists it with its status (AC-FR-3.1, AC-FR-3.2)', async () => {
      await goAs(page, '/requests/mine', requester);
      const ticket = page.getByRole('link', { name: new RegExp(reference) });
      await expect(ticket).toHaveCount(1);
      await expect(ticket).toContainText(STATUS.RECEIVED);
    });
  } finally {
    await context.close();
  }
});

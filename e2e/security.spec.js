/**
 * E2E-8: a security-category request, across Requester, Security Officer, Coordinator
 * and Technician, in real Chromium sessions.
 *
 * Basis: FR-1.5 / AC-FR-1.5 (the description of a security-category request is for the
 * Security Officer; read literally a Requester on their own security request does not
 * receive it, OI-16 open), AC-NFR-4.4 (another staff role is refused: 403, nothing of
 * the request disclosed), FR-3.5 (a Requester sees only a mapped status: Received, In
 * Progress or Closed), FR-5.2 (a Security Officer accepts), team decision #10 of
 * 17/10/2026 (OI-15: a Security Officer is offered, and may accept, only security-category
 * requests, a Technician only others). Case: DEC-019 (Context).
 *
 * Expected results, written before the first run from those sources:
 *  1. Requester submits, on the form, the category "security concerns" (isSecurity true):
 *     201; stored: one request, securityCategory true, status Received, the typed
 *     description, the Requester as requester.
 *  2. Security Officer (authorised for both categories) opens it: the read is 200 with the
 *     description and the true status Received, permittedAssignment accept true and assign
 *     false; the page shows the description and an "Accept this request" button and no
 *     "Assign to" control.
 *  3. Accept this request: 201; page status Assigned; stored: assigneeId the Security
 *     Officer, status Assigned, version 2, one added 'assignment' entry by the Security
 *     Officer in role Security Officer to the Security Officer; the Accept button is gone.
 *  4. Coordinator (authorised for both categories, so only the security rule can refuse):
 *     the read is 403 FORBIDDEN, the body discloses no reference, version or description,
 *     the page shows an alert naming FORBIDDEN and neither the reference nor the
 *     description. Control: the same Coordinator opens an ordinary request and sees it.
 *  5. Requester opens their own request (status stored as Assigned): the read is 200, has
 *     no description, resolution or closureReason key, status "Received" (the mapped value,
 *     not Assigned), no permitted moves or assignment; the page shows Received and not the
 *     description; no response received in this view contains the description text.
 *  6. Decision #10 on an ordinary request (Received, unassigned): the Security Officer
 *     is NOT offered Accept (permittedAssignment accept false, no button); a Technician
 *     authorised for the same category IS (accept true, button shown).
 *
 * Shows: the security-category path end to end through the built client; the refusal and
 * the withheld description in the real responses and on screen; the assignment fit rule.
 * Does NOT show: the Requester seeing the mapped status on My requests; comments and
 * actions on a security request; that a Manager or Technician is refused (the Coordinator
 * stands for staff without the role); OI-16's outcome (the Requester exclusion follows FR-1.5
 * read literally and may change); a Security Officer closing a security request;
 * non-Chromium behaviour beyond what the four projects run. Assertions are scoped to this
 * fixture's campus and users (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, snapshot, leafValues } from './support/cluster.js';
import {
  createCampus, addUser, insertRequest, requestsOf, SECURITY_CATEGORY_NAME,
} from './support/campus.js';
import { openSession, goAs, isPost, isGetPath } from './support/session.js';
import { expectNoRequestData } from './support/ui.js';

const MAPPED = [STATUS.RECEIVED, STATUS.IN_PROGRESS, STATUS.CLOSED];   // FR-3.5
const ACCEPT = 'Accept this request';

useCluster();

/** The next read of a request that answers with this status. Register before the navigation that causes it. */
const readWith = (page, id, status) => page.waitForResponse((r) => isGetPath(`/api/v1/requests/${id}`)(r) && r.status() === status);

test('E2E-8: security-category request across roles (AC-FR-1.5, AC-NFR-4.4, FR-3.5, decision #10)', async ({ browser, baseURL }) => {
  const campus = await createCampus({ withSecurityCategory: true });
  const both = [campus.categoryId, campus.security._id];
  const requester = await addUser(campus, ROLE.REQUESTER);
  const officer = await addUser(campus, ROLE.SECURITY_OFFICER, { categoryIds: both });
  const coordinator = await addUser(campus, ROLE.COORDINATOR, { categoryIds: both });
  const technician = await addUser(campus, ROLE.TECHNICIAN, { categoryIds: both });
  const ordinary = await insertRequest(campus, requester);          // Received, unassigned, not security
  const location = `E2E ${campus.runId} security office door`;
  const description = `E2E ${campus.runId} security description of a forced lock`;

  const req = await openSession(browser, baseURL);
  const so = await openSession(browser, baseURL);
  const coord = await openSession(browser, baseURL);
  const tech = await openSession(browser, baseURL);

  try {
    let requestId;
    let reference;
    await test.step('1. Requester submits in the security category (FR-1.5)', async () => {
      await goAs(req.page, '/requests/new', requester);
      await req.page.getByRole('radio', { name: SECURITY_CATEGORY_NAME }).check();
      await req.page.getByLabel('Location').fill(location);
      await req.page.getByLabel('Description').fill(description);
      const [response] = await Promise.all([
        req.page.waitForResponse(isPost('/api/v1/requests')),
        req.page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      expect(response.status()).toBe(201);
      reference = (await req.page.getByTestId('submitted-reference').textContent()).trim();

      const stored = await requestsOf(requester.user);
      const mine = stored.filter((r) => r.categoryId === String(campus.security._id));
      expect(mine).toHaveLength(1);
      expect(mine[0].reference).toBe(reference);
      expect(mine[0].securityCategory).toBe(true);
      expect(mine[0].status).toBe(STATUS.RECEIVED);
      expect(mine[0].description).toBe(description);
      expect(mine[0].requesterId).toBe(requester.id);
      requestId = mine[0]._id;
    });

    await test.step('2. Security Officer sees the description and is offered Accept (FR-1.5, decision #10)', async () => {
      const [get] = await Promise.all([readWith(so.page, requestId, 200), goAs(so.page, `/requests/${requestId}`, officer)]);
      const body = await get.json();
      expect(body.description).toBe(description);
      expect(body.status).toBe(STATUS.RECEIVED);
      expect(body.permittedAssignment).toEqual({ assign: false, accept: true });
      await expect(so.page.getByTestId('reference')).toHaveText(reference);
      await expect(so.page.getByText(description)).toBeVisible();
      await expect(so.page.getByRole('button', { name: ACCEPT })).toBeVisible();
      await expect(so.page.getByLabel('Assign to')).toHaveCount(0);
    });

    await test.step('3. the Security Officer accepts it (FR-5.2, decision #10)', async () => {
      const [response] = await Promise.all([
        so.page.waitForResponse(isPost(`/api/v1/requests/${requestId}/assignments`)),
        so.page.getByRole('button', { name: ACCEPT }).click(),
      ]);
      expect(response.status()).toBe(201);
      await expect(so.page.getByTestId('status')).toHaveText(STATUS.ASSIGNED);
      await expect(so.page.getByRole('button', { name: ACCEPT })).toHaveCount(0);

      const after = await snapshot(requestId);
      expect(after.request.assigneeId).toBe(officer.id);
      expect(after.request.status).toBe(STATUS.ASSIGNED);
      expect(after.request.version).toBe(2);
      const entries = after.history.filter((e) => e.changeType === 'assignment');
      expect(entries).toHaveLength(1);
      expect(entries[0].actorId).toBe(officer.id);
      expect(entries[0].actorRole).toBe(ROLE.SECURITY_OFFICER);
      expect(entries[0].toAssigneeId).toBe(officer.id);
    });

    await test.step('4. a Coordinator is refused and sees nothing of it (AC-NFR-4.4)', async () => {
      const [get] = await Promise.all([readWith(coord.page, requestId, 403), goAs(coord.page, `/requests/${requestId}`, coordinator)]);
      const body = await get.json();
      expect(body.code).toBe('FORBIDDEN');
      expectNoRequestData(body, 403);
      expect(leafValues(body)).not.toContain(description);
      expect(leafValues(body)).not.toContain(reference);
      await expect(coord.page.getByRole('alert')).toContainText('FORBIDDEN');
      await expect(coord.page.getByTestId('reference')).toHaveCount(0);
      await expect(coord.page.locator('body')).not.toContainText(description);
      await expect(coord.page.locator('body')).not.toContainText(reference);

      // Control: the refusal is the security rule, not a missing session or category authorisation.
      await goAs(coord.page, `/requests/${ordinary.requestId}`, coordinator);
      await expect(coord.page.getByTestId('reference')).toHaveText(ordinary.reference);
    });

    await test.step('5. the Requester sees no description and only a mapped status (FR-3.5, FR-1.5)', async () => {
      const received = [];
      req.page.on('response', (r) => {
        if (new URL(r.url()).pathname.startsWith('/api/')) received.push(r.text().catch(() => ''));
      });
      const [get] = await Promise.all([readWith(req.page, requestId, 200), goAs(req.page, `/requests/${requestId}`, requester)]);
      const body = await get.json();
      expect(body).not.toHaveProperty('description');
      expect(body).not.toHaveProperty('resolution');
      expect(body).not.toHaveProperty('closureReason');
      expect((await snapshot(requestId)).request.status).toBe(STATUS.ASSIGNED);   // the stored, internal status
      expect(body.status).toBe(STATUS.RECEIVED);                                  // the mapped one
      expect(MAPPED).toContain(body.status);
      expect(body.permittedTransitions).toEqual([]);
      expect(body.permittedAssignment).toEqual({ assign: false, accept: false });

      await expect(req.page.getByTestId('status')).toHaveText(STATUS.RECEIVED);
      await expect(req.page.getByText(description)).toHaveCount(0);
      await expect(req.page.getByLabel('New status')).toHaveCount(0);
      await req.page.waitForLoadState('networkidle');
      for (const text of await Promise.all(received)) expect(text).not.toContain(description);
    });

    await test.step('6. on an ordinary request the Security Officer is not offered Accept (decision #10)', async () => {
      const [get] = await Promise.all([readWith(so.page, ordinary.requestId, 200), goAs(so.page, `/requests/${ordinary.requestId}`, officer)]);
      expect((await get.json()).permittedAssignment.accept).toBe(false);
      await expect(so.page.getByTestId('reference')).toHaveText(ordinary.reference);
      await expect(so.page.getByTestId('status')).toHaveText(STATUS.RECEIVED);
      await expect(so.page.getByRole('button', { name: ACCEPT })).toHaveCount(0);

      // Control: the same request, the same category, is offered to a Technician.
      const [techGet] = await Promise.all([readWith(tech.page, ordinary.requestId, 200), goAs(tech.page, `/requests/${ordinary.requestId}`, technician)]);
      expect((await techGet.json()).permittedAssignment.accept).toBe(true);
      await expect(tech.page.getByRole('button', { name: ACCEPT })).toBeVisible();
    });
  } finally {
    await Promise.all([req.context.close(), so.context.close(), coord.context.close(), tech.context.close()]);
  }
});

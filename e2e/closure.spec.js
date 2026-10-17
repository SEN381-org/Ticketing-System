/**
 * E2E-9: a Coordinator closes a Resolved request, and must give a reason, in a real Chromium session.
 *
 * Basis: AC-FR-6.6 (Closed needs a recorded reason: refused without it with nothing
 * changed; with it the reason is stored and shown in the history), FR-6.6 (an authorised
 * staff user closes), TD-003 (the Update status panel offers only the moves the server
 * permits), the client change of 17/10/2026 (C5: the New status control starts on the
 * placeholder "Choose a new status…" and Submit stays disabled until a status is chosen).
 * Case: DEC-019 (Context).
 *
 * Expected results, written before the first run from those sources:
 *  1. Coordinator, request page of a Resolved request: status Resolved. The New
 *     status control has the empty value, its checked option reads "Choose a new
 *     status…", and Submit transition is disabled. Closed is among the options.
 *  2. Closed chosen, reason empty: Submit is enabled; the server answers 422
 *     INVALID_TRANSITION, an alert shows it, the page still reads Resolved, and the
 *     stored request is untouched: status Resolved, same version, no closure
 *     reason, no history entry (AC-FR-6.6 refusal clause).
 *  3. A reason typed and submitted: 201; status Closed; version one higher;
 *     closure.reason is the text and closure.closedById the Coordinator; exactly one
 *     history entry, Resolved to Closed, by the Coordinator in role Coordinator,
 *     whose body is the reason (AC-FR-6.6 store clause).
 *  4. The History list shows a Closed item that contains the reason (AC-FR-6.6
 *     "displays it in the history"), and the New status control is no longer
 *     offered (Closed is terminal).
 *
 * Shows: the placeholder-first control and the disabled Submit, the server (not the
 * client) refusing the missing reason, and the reason stored and displayed.
 * Does NOT show: the same for Rejected; a Manager closing; that a Technician is
 * refused (E2E-4 shows the options, tests/ show the 403); concurrency (412);
 * non-Chromium behaviour beyond what the four projects run. Assertions are scoped to this
 * fixture's request and users (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, snapshot } from './support/cluster.js';
import { createCampus, addUser, insertRequest } from './support/campus.js';
import { openSession, goAs, isPost } from './support/session.js';

const PLACEHOLDER = 'Choose a new status…';

useCluster();

test('E2E-9: Coordinator closes a Resolved request with a reason (AC-FR-6.6, FR-6.6, TD-003)', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const coordinator = await addUser(campus, ROLE.COORDINATOR);
  const { requestId } = await insertRequest(campus, requester, { status: STATUS.RESOLVED, assignee: technician });
  const transitions = `/api/v1/requests/${requestId}/transitions`;
  const { context, page } = await openSession(browser, baseURL);

  const select = page.getByLabel('New status');
  const submit = page.getByRole('button', { name: 'Submit transition' });
  const reason = `E2E ${campus.runId} confirmed fixed with the requester`;

  try {
    await test.step('1. the control starts on the placeholder, Submit disabled, Closed offered (C5, TD-003)', async () => {
      await goAs(page, `/requests/${requestId}`, coordinator);
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      await expect(select).toHaveValue('');
      await expect(select.locator('option:checked')).toHaveText(PLACEHOLDER);
      await expect(submit).toBeDisabled();
      expect(await select.locator('option').allTextContents()).toContain(STATUS.CLOSED);
    });

    await test.step('2. Closed with no reason: the server refuses, nothing changes (AC-FR-6.6)', async () => {
      const before = await snapshot(requestId);
      await select.selectOption(STATUS.CLOSED);
      await expect(submit).toBeEnabled();
      const [response] = await Promise.all([page.waitForResponse(isPost(transitions)), submit.click()]);
      expect(response.status()).toBe(422);
      expect((await response.json()).code).toBe('INVALID_TRANSITION');
      await expect(page.getByRole('alert')).toContainText('INVALID_TRANSITION');
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);

      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.RESOLVED);
      expect(after.request.version).toBe(before.request.version);
      expect(after.request.closure?.reason ?? null).toBeNull();
      expect(after.history).toHaveLength(before.history.length);
    });

    await test.step('3. with a reason: Closed, reason stored, one history entry (AC-FR-6.6)', async () => {
      const before = await snapshot(requestId);
      await page.getByLabel('Reason', { exact: true }).fill(reason);
      const [response] = await Promise.all([page.waitForResponse(isPost(transitions)), submit.click()]);
      expect(response.status()).toBe(201);
      await expect(page.getByTestId('status')).toHaveText(STATUS.CLOSED);

      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.CLOSED);
      expect(after.request.version).toBe(before.request.version + 1);
      expect(after.request.closure.reason).toBe(reason);
      expect(after.request.closure.closedById).toBe(coordinator.id);
      expect(after.history).toHaveLength(before.history.length + 1);
      const entry = after.history[after.history.length - 1];
      expect(entry.changeType).toBe('status');
      expect(entry.fromStatus).toBe(STATUS.RESOLVED);
      expect(entry.toStatus).toBe(STATUS.CLOSED);
      expect(entry.actorId).toBe(coordinator.id);
      expect(entry.actorRole).toBe(ROLE.COORDINATOR);
      expect(entry.body).toBe(reason);
    });

    await test.step('4. the history displays the reason; no further move is offered (AC-FR-6.6)', async () => {
      const items = page.getByRole('list', { name: 'Changes' }).getByRole('listitem');
      const closed = items.filter({ has: page.locator('.timeline__title', { hasText: new RegExp(`^${STATUS.CLOSED}$`) }) });
      await expect(closed).toHaveCount(1);
      await expect(closed).toContainText(reason);
      await expect(page.getByLabel('New status')).toHaveCount(0);
    });
  } finally {
    await context.close();
  }
});

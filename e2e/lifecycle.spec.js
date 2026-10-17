/**
 * E2E-4: a request's lifecycle across four roles, in real Chromium sessions.
 *
 * Basis: AC-FR-5.1 and AC-FR-5.4 (a Coordinator assigns to a Technician; the
 * assignment entry carries actor, role and time), AC-FR-6.5 (Resolved needs
 * resolution information: refused without it), AC-FR-6.6 (Closed needs a recorded
 * reason: refused without it, stored, and shown in the history), AC-FR-3.3 (a
 * Requester sees each status change with its date), TD-003 (the Update status
 * panel offers only the moves the server permits), FR-6.4 and FR-6.6 (a
 * Technician may not close or reject). Case: DEC-019 (Context).
 *
 * Needs the read of GET /api/v1/requests/{id} that carries permittedTransitions
 * (the client builds the panel from it and from nothing else). Against a server
 * without it no panel is rendered and the transition steps fail by timeout.
 *
 * Expected results, written before the first run from those sources:
 *  1. Coordinator, request queue: Assign on the Received request's row, pick the
 *     Technician, Confirm. Server: assigneeId is the Technician, status Assigned,
 *     version 2, one history entry changeType 'assignment', actor the Coordinator,
 *     role Coordinator, toAssigneeId the Technician, occurredAt inside the step.
 *  2. Technician, request page: status Assigned. The New status select offers In
 *     Progress and never Closed or Rejected (TD-003, FR-6.6). In Progress is
 *     submitted: 201, status In Progress, version 3, one status entry
 *     Assigned to In Progress by the Technician.
 *  3. Technician, In Progress, Resolved chosen with no resolution: the server
 *     answers 422 INVALID_TRANSITION, an alert shows it, and status, version and
 *     history are exactly as before (AC-FR-6.5). Never Closed or Rejected offered.
 *  4. Technician fills the resolution: 201, status Resolved, resolution.summary is
 *     the typed text, version 4, a status entry In Progress to Resolved.
 *     At Resolved the Technician is still never offered Closed or Rejected.
 *  5. Coordinator, Resolved, Closed chosen with no reason: 422, status stays
 *     Resolved, no closure reason stored, history unchanged (AC-FR-6.6). With a
 *     reason: 201, status Closed, closure.reason is the text, closure.closedById the
 *     Coordinator, a status entry whose body is the reason.
 *  6. Requester, request page: status Closed; the History list shows, in order,
 *     In Progress, Resolved and Closed, each with a time element equal to the
 *     stored occurredAt; the Closed item shows the reason; no status-change
 *     control is offered (AC-FR-3.3, AC-FR-6.6 "displays it in the history").
 *
 * Shows: the full path through four roles using only the system's own interface for
 * every write; each refusal leaving the stored request untouched; the server's own
 * list of permitted moves reaching the select.
 * Does NOT show: that the Requester sees the Received to Assigned change (the
 * history read gives a Requester created, status and detail entries only, and
 * assignment is its own entry type, so the step is recorded as an annotation, not
 * asserted); Rejected, On Hold or reopen; reassignment; notifications; concurrency
 * (412) from the client; the Security Officer; non-Chromium browsers.
 * Assertions are scoped to this fixture's request and users (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster, snapshot } from './support/cluster.js';
import { createCampus, addUser, insertRequest } from './support/campus.js';
import { openSession, goAs, isPost } from './support/session.js';

useCluster();

const optionsOf = (page) => page.getByLabel('New status').locator('option').allTextContents();

/** TD-003 / FR-6.6: the Technician is never offered the two disposition moves. */
async function expectNoDisposition(page) {
  const offered = await optionsOf(page);
  expect(offered).not.toContain(STATUS.CLOSED);
  expect(offered).not.toContain(STATUS.REJECTED);
  return offered;
}

test('E2E-4: lifecycle across roles (AC-FR-5.1, AC-FR-5.4, AC-FR-6.5, AC-FR-6.6, AC-FR-3.3, TD-003)', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const coordinator = await addUser(campus, ROLE.COORDINATOR);
  const { requestId, reference } = await insertRequest(campus, requester);
  const transitions = `/api/v1/requests/${requestId}/transitions`;

  const coord = await openSession(browser, baseURL);
  const tech = await openSession(browser, baseURL);
  const req = await openSession(browser, baseURL);

  /** Chooses a status, optionally fills reason / resolution, submits, and returns the response. */
  const submitTransition = async (page, toStatus, { reason, resolution } = {}) => {
    await page.getByLabel('New status').selectOption(toStatus);
    if (reason !== undefined) await page.getByLabel('Reason', { exact: true }).fill(reason);
    if (resolution !== undefined) await page.getByLabel('Resolution', { exact: true }).fill(resolution);
    const [response] = await Promise.all([
      page.waitForResponse(isPost(transitions)),
      page.getByRole('button', { name: 'Submit transition' }).click(),
    ]);
    return response;
  };

  try {
    await test.step('1. Coordinator assigns from the request queue (AC-FR-5.1, AC-FR-5.4)', async () => {
      const startedAt = Date.now();
      await goAs(coord.page, '/requests', coordinator);
      const row = coord.page.getByRole('row', { name: new RegExp(reference) });
      await row.getByRole('button', { name: 'Assign', exact: true }).click();
      await coord.page.getByLabel(`Assign ${reference} to`).selectOption({ label: technician.displayName });
      const [response] = await Promise.all([
        coord.page.waitForResponse(isPost(`/api/v1/requests/${requestId}/assignments`)),
        row.getByRole('button', { name: 'Confirm' }).click(),
      ]);
      expect(response.status()).toBe(201);
      await expect(row).toContainText(STATUS.ASSIGNED);

      const after = await snapshot(requestId);
      expect(after.request.assigneeId).toBe(technician.id);
      expect(after.request.status).toBe(STATUS.ASSIGNED);
      expect(after.request.version).toBe(2);
      expect(after.history).toHaveLength(1);
      const [entry] = after.history;
      expect(entry.changeType).toBe('assignment');
      expect(entry.actorId).toBe(coordinator.id);
      expect(entry.actorRole).toBe(ROLE.COORDINATOR);
      expect(entry.toAssigneeId).toBe(technician.id);
      const at = Date.parse(entry.occurredAt);
      expect(at).toBeGreaterThanOrEqual(startedAt);
      expect(at).toBeLessThanOrEqual(Date.now());
    });

    await test.step('2. Technician moves it to In Progress; only permitted moves are offered (TD-003)', async () => {
      await goAs(tech.page, `/requests/${requestId}`, technician);
      await expect(tech.page.getByTestId('status')).toHaveText(STATUS.ASSIGNED);
      await expect(tech.page.getByRole('region', { name: 'Update status' })).toBeVisible();
      const offered = await expectNoDisposition(tech.page);
      expect(offered).toContain(STATUS.IN_PROGRESS);

      const response = await submitTransition(tech.page, STATUS.IN_PROGRESS);
      expect(response.status()).toBe(201);
      await expect(tech.page.getByTestId('status')).toHaveText(STATUS.IN_PROGRESS);

      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.IN_PROGRESS);
      expect(after.request.version).toBe(3);
      expect(after.history).toHaveLength(2);
      const entry = after.history[1];
      expect(entry.changeType).toBe('status');
      expect(entry.fromStatus).toBe(STATUS.ASSIGNED);
      expect(entry.toStatus).toBe(STATUS.IN_PROGRESS);
      expect(entry.actorId).toBe(technician.id);
      expect(entry.actorRole).toBe(ROLE.TECHNICIAN);
    });

    const resolution = `E2E ${campus.runId} roller door realigned and tested`;
    await test.step('3. Resolved without resolution information is refused (AC-FR-6.5)', async () => {
      const offered = await expectNoDisposition(tech.page);
      expect(offered).toContain(STATUS.RESOLVED);
      const before = await snapshot(requestId);

      const response = await submitTransition(tech.page, STATUS.RESOLVED);
      expect(response.status()).toBe(422);
      expect((await response.json()).code).toBe('INVALID_TRANSITION');
      await expect(tech.page.getByRole('alert')).toContainText('INVALID_TRANSITION');

      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.IN_PROGRESS);
      expect(after.request.version).toBe(before.request.version);
      expect(after.request.resolution?.summary ?? null).toBeNull();
      expect(after.history).toHaveLength(before.history.length);
    });

    await test.step('4. Technician records the resolution and resolves (AC-FR-6.5)', async () => {
      const response = await submitTransition(tech.page, STATUS.RESOLVED, { resolution });
      expect(response.status()).toBe(201);
      await expect(tech.page.getByTestId('status')).toHaveText(STATUS.RESOLVED);

      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.RESOLVED);
      expect(after.request.version).toBe(4);
      expect(after.request.resolution.summary).toBe(resolution);
      expect(after.history).toHaveLength(3);
      expect(after.history[2].fromStatus).toBe(STATUS.IN_PROGRESS);
      expect(after.history[2].toStatus).toBe(STATUS.RESOLVED);
      await expectNoDisposition(tech.page);               // still true at Resolved (TD-003)
    });

    const reason = `E2E ${campus.runId} confirmed fixed with the requester`;
    await test.step('5. Coordinator closes: refused without a reason, then with one (AC-FR-6.6)', async () => {
      await goAs(coord.page, `/requests/${requestId}`, coordinator);
      await expect(coord.page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      expect(await optionsOf(coord.page)).toContain(STATUS.CLOSED);
      const before = await snapshot(requestId);

      const refused = await submitTransition(coord.page, STATUS.CLOSED, { reason: '' });
      expect(refused.status()).toBe(422);
      expect((await refused.json()).code).toBe('INVALID_TRANSITION');
      const unchanged = await snapshot(requestId);
      expect(unchanged.request.status).toBe(STATUS.RESOLVED);
      expect(unchanged.request.version).toBe(before.request.version);
      expect(unchanged.request.closure?.reason ?? null).toBeNull();
      expect(unchanged.history).toHaveLength(before.history.length);

      const accepted = await submitTransition(coord.page, STATUS.CLOSED, { reason });
      expect(accepted.status()).toBe(201);
      await expect(coord.page.getByTestId('status')).toHaveText(STATUS.CLOSED);
      const after = await snapshot(requestId);
      expect(after.request.status).toBe(STATUS.CLOSED);
      expect(after.request.version).toBe(5);
      expect(after.request.closure.reason).toBe(reason);
      expect(after.request.closure.closedById).toBe(coordinator.id);
      expect(after.history).toHaveLength(4);
      expect(after.history[3].toStatus).toBe(STATUS.CLOSED);
      expect(after.history[3].body).toBe(reason);
    });

    await test.step('6. Requester sees each status change with its date and the reason (AC-FR-3.3, AC-FR-6.6)', async () => {
      await goAs(req.page, `/requests/${requestId}`, requester);
      await expect(req.page.getByTestId('status')).toHaveText(STATUS.CLOSED);
      await expect(req.page.getByLabel('New status')).toHaveCount(0);   // no move offered to a Requester (TD-003)

      const { history } = await snapshot(requestId);
      const changes = history.filter((e) => e.changeType === 'status');
      const items = req.page.getByRole('list', { name: 'Changes' }).getByRole('listitem');
      // The history loads after the request, so the titles are read only once the Closed
      // entry is on screen (allTextContents does not wait).
      await expect(items.filter({ has: req.page.locator('.timeline__title', { hasText: new RegExp(`^${STATUS.CLOSED}$`) }) })).toHaveCount(1);
      const titles = await items.locator('.timeline__title').allTextContents();
      if (!titles.includes(STATUS.ASSIGNED)) {
        test.info().annotations.push({
          type: 'observation',
          description: 'The Requester history has no entry for Received to Assigned: assignment is its own entry type and is withheld from a Requester.',
        });
      }
      for (const status of [STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CLOSED]) {
        const stored = changes.find((e) => e.toStatus === status);
        const item = items.filter({ has: req.page.locator('.timeline__title', { hasText: new RegExp(`^${status}$`) }) });
        await expect(item).toHaveCount(1);
        const shown = await item.locator('time').getAttribute('datetime');
        expect(Date.parse(shown)).toBe(Date.parse(stored.occurredAt));   // the date of the change
      }
      const closed = items.filter({ has: req.page.locator('.timeline__title', { hasText: new RegExp(`^${STATUS.CLOSED}$`) }) });
      await expect(closed).toContainText(reason);                          // AC-FR-6.6 "displays it in the history"
      const order = titles.filter((t) => [STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CLOSED].includes(t));
      expect(order).toEqual([STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CLOSED]);
    });
  } finally {
    await Promise.all([coord.context.close(), tech.context.close(), req.context.close()]);
  }
});

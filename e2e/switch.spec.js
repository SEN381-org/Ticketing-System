/**
 * E2E-10: one person signs out and another signs in, in the SAME browser tab, and
 * nothing of the first is kept (DEF-024, the cache defect; A9, the landing after sign-in).
 *
 * Basis: DEF-024 (a request page showed the previous user's view in a shared browser),
 * the server change of 17/10/2026 (every /api response carries Cache-Control: no-store and a
 * conditional GET is never answered 304), the client change of 17/10/2026 (screens remount
 * when a different person signs in; a request is read again for the new user), FR-6.4 and
 * FR-6.6 (who may move a Resolved request), FR-1.5 / AC-FR-1.5 (the description of a
 * security-category request is for the Security Officer; a Requester on their own does
 * not receive it, OI-16 open), FR-3.5 (a mapped status), A9 (a person who signs in on a
 * page that is not theirs, after someone else, lands on their own home page). Case: DEC-019.
 *
 * One browser context and one page for every person below, so cookies are replaced and
 * sessionStorage and the HTTP cache are shared exactly as on a shared workstation.
 *
 * Expected results, written before the first run from those sources:
 *  1. A9. A Manager signs in on /management and stays (their page). After sign-out, a
 *     Requester signs in at the prompt shown at /management: the address becomes
 *     /requests/mine, "My requests" is shown, no alert and no "No access" state is on the page, and
 *     no GET /api/v1/reports/summary was answered 403 after that sign-in.
 *  2. A Technician signs in on a Resolved request (assigned to them): status Resolved;
 *     the New status control offers exactly the placeholder and In Progress; Closed is
 *     not offered. They sign out: the prompt is shown and no reference remains on the page.
 *  3. A Coordinator signs in in the same tab: the status is still Resolved; the read
 *     lists Closed among its permitted moves; the control offers Closed (and not only
 *     what the Technician had). A reload re-reads the request: 200, never 304, and the
 *     control still offers Closed.
 *  4. A Security Officer signs in on a security-category request (stored Assigned, theirs):
 *     the description is shown, and the status is Assigned.
 *  5. The Requester who owns it signs in in the same tab: the page shows no description
 *     and the mapped status Received (not Assigned); the read has no description key; no
 *     response received since the sign-in contains the description text.
 *  6. Every 200 read of a request in the whole case carries Cache-Control: no-store.
 *
 * Shows: that nothing of one session's view survives into the next in a shared tab, both
 * in the controls (permitted moves) and in the withheld security description, through the
 * real server and the HTTP cache. Does NOT show: other browsers' cache policies beyond the
 * four configured projects; the browser back button after sign-out; storage other than
 * sessionStorage and the HTTP cache; the audit log (A9 is asserted on the page and on the
 * report responses only). Assertions are scoped to this fixture's campus and users (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster } from './support/cluster.js';
import { createCampus, addUser, insertRequest } from './support/campus.js';
import { openSession, signInAs, isGetPath } from './support/session.js';

const PLACEHOLDER = 'Choose a new status…';

useCluster();

test('E2E-10: a second person in the same tab sees nothing of the first (DEF-024, A9, FR-1.5, FR-3.5)', async ({ browser, baseURL }) => {
  const campus = await createCampus({ withSecurityCategory: true });
  const both = [campus.categoryId, campus.security._id];
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const coordinator = await addUser(campus, ROLE.COORDINATOR);
  const manager = await addUser(campus, ROLE.MANAGER);
  const officer = await addUser(campus, ROLE.SECURITY_OFFICER, { categoryIds: both });
  const resolved = await insertRequest(campus, requester, { status: STATUS.RESOLVED, assignee: technician });
  const description = `E2E ${campus.runId} security description of a forced lock`;
  const secure = await insertRequest(campus, requester, {
    status: STATUS.ASSIGNED, assignee: officer, security: true, categoryId: campus.security._id, description,
  });

  const { context, page } = await openSession(browser, baseURL);
  const reads = [];                                  // every GET of a request, in this tab
  const received = [];                               // every /api response in this tab: { path, status, text }
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname;
    if (!path.startsWith('/api/')) return;
    received.push({ path, status: r.status(), text: r.text().catch(() => '') });
    if ([resolved.requestId, secure.requestId].some((id) => isGetPath(`/api/v1/requests/${id}`)(r))) reads.push(r);
  });

  const optionsOf = () => page.getByLabel('New status').locator('option').allTextContents();
  const signOut = async () => {
    const [del] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === '/api/v1/sessions/current'),
      page.getByRole('button', { name: 'Sign out' }).click(),
    ]);
    expect(del.status()).toBe(204);                  // DEC-018 section 5
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  };
  const readOf = (id) => (r) => isGetPath(`/api/v1/requests/${id}`)(r);

  try {
    await test.step('1. A9: a Requester signing in where a Manager was lands on My requests', async () => {
      await page.goto('/management');
      await signInAs(page, manager);
      await expect(page).toHaveURL(/\/management$/);
      await expect(page.getByTestId('total')).toBeVisible();
      await signOut();

      const mark = received.length;
      await signInAs(page, requester);
      await expect(page).toHaveURL(/\/requests\/mine$/);
      await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('No access')).toHaveCount(0);
      const refused = received.slice(mark).filter((x) => x.path === '/api/v1/reports/summary' && x.status === 403);
      expect(refused).toHaveLength(0);
      await signOut();
    });

    await test.step('2. a Technician on a Resolved request is offered only In Progress (FR-6.6)', async () => {
      await page.goto(`/requests/${resolved.requestId}`);
      await signInAs(page, technician);
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      await expect(page.getByRole('region', { name: 'Update status' })).toBeVisible();
      expect(await optionsOf()).toEqual([PLACEHOLDER, STATUS.IN_PROGRESS]);
      await signOut();
      await expect(page.getByTestId('reference')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(resolved.reference);
    });

    await test.step('3. a Coordinator in the same tab is offered Closed; a reload still is (DEF-024)', async () => {
      const [get] = await Promise.all([
        page.waitForResponse((r) => readOf(resolved.requestId)(r) && r.status() === 200),
        signInAs(page, coordinator),
      ]);
      const permitted = (await get.json()).permittedTransitions.map((t) => t.toStatus);
      expect(permitted).toContain(STATUS.CLOSED);
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      const offered = await optionsOf();
      expect(offered).toContain(STATUS.CLOSED);
      expect(offered).toContain(STATUS.IN_PROGRESS);
      expect(offered).not.toEqual([PLACEHOLDER, STATUS.IN_PROGRESS]);      // not the Technician's view

      const [again] = await Promise.all([page.waitForResponse(readOf(resolved.requestId)), page.reload()]);
      expect(again.status()).toBe(200);              // never a 304 from a cached copy
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      expect(await optionsOf()).toContain(STATUS.CLOSED);
      await signOut();
    });

    await test.step('4. a Security Officer sees the description of a security request (FR-1.5)', async () => {
      await page.goto(`/requests/${secure.requestId}`);
      await signInAs(page, officer);
      await expect(page.getByTestId('reference')).toHaveText(secure.reference);
      await expect(page.getByTestId('status')).toHaveText(STATUS.ASSIGNED);
      await expect(page.getByText(description)).toBeVisible();
      await signOut();
      await expect(page.getByText(description)).toHaveCount(0);
    });

    await test.step('5. its Requester, in the same tab, gets no description and a mapped status (FR-1.5, FR-3.5)', async () => {
      const mark = received.length;
      const [get] = await Promise.all([
        page.waitForResponse((r) => readOf(secure.requestId)(r) && r.status() === 200),
        signInAs(page, requester),
      ]);
      const body = await get.json();
      expect(body).not.toHaveProperty('description');
      expect(body.status).toBe(STATUS.RECEIVED);     // stored Assigned, mapped by FR-3.5
      await expect(page.getByTestId('status')).toHaveText(STATUS.RECEIVED);
      await expect(page.getByText(description)).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      for (const x of received.slice(mark)) expect(await x.text, x.path).not.toContain(description);
      await expect(page.locator('body')).not.toContainText(description);
    });

    await test.step('6. every read of a request carried Cache-Control: no-store (DEF-024)', async () => {
      const ok = reads.filter((r) => r.status() === 200);
      expect(ok.length).toBeGreaterThanOrEqual(5);
      for (const r of ok) expect(r.headers()['cache-control']).toBe('no-store');
    });
  } finally {
    await context.close();
  }
});

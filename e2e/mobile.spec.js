/**
 * E2E-6: Requester and Technician screens at 360 CSS pixels, in real Chromium.
 *
 * Basis: AC-NFR-1.2 (NFR-1.2): at a viewport 360 CSS pixels wide, with each
 * Requester and Technician function exercised, no horizontal scrolling is
 * required and every interactive control measures at least 44 x 44 CSS pixels.
 * Case: DEC-019 (Context).
 *
 * Expected results, written before the first run from the AC:
 *  For every screen listed below, with the viewport 360 x 740:
 *   - document.documentElement.scrollWidth is at most 360;
 *   - every rendered button, a, input, select, textarea and [role=button] has a
 *     bounding box of at least 44 x 44 (threshold 43.99 for sub-pixel layout);
 *   - at least one control was measured (a page that measured nothing is not a pass).
 *  Requester screens: sign-in, My requests, New request (form), the submission
 *  confirmation, the request page, notifications.
 *  Technician screens: sign-in, request queue, the request page with the Update
 *  status panel (Assigned), notifications.
 *  A failure lists each offending element: screen, tag, name and measured size.
 *
 * Shows: the two measurements, on the built client against the real server, with
 * real data on every screen (a submitted request; an assigned request).
 * Does NOT show: the AC at any other width; zoom or text-size changes; touch
 * rather than pointer input; controls that appear only after an interaction the
 * journey does not perform (an open assignment picker, a validation error); the
 * Coordinator, Manager or Administrator screens (AC-NFR-1.2 names Requester and
 * Technician only); non-Chromium browsers (AC-NFR-1.1).
 */
import { test, expect } from '@playwright/test';

import { ROLE, STATUS } from '../shared/domainValues.js';
import { useCluster } from './support/cluster.js';
import { createCampus, addUser, insertRequest, BRIEF_CATEGORY_NAME } from './support/campus.js';
import { openSession, goAs, isPost, isGetPath } from './support/session.js';
import { VIEWPORT_360, MIN_TARGET, measure } from './support/viewport.js';

useCluster();

/** Measures the screen on view; reports every offender at once. */
async function checkScreen(page, name, problems) {
  const result = await measure(page);
  expect(result.controls, `${name}: no interactive control was measured`).toBeGreaterThan(0);
  if (result.scrollWidth > VIEWPORT_360.width) {
    problems.push(`${name}: horizontal scroll, scrollWidth ${result.scrollWidth} > ${VIEWPORT_360.width}`);
  }
  for (const o of result.offenders) {
    problems.push(`${name}: <${o.tag}> "${o.name}" is ${o.width} x ${o.height}, under ${MIN_TARGET} x ${MIN_TARGET}`);
  }
}

test('E2E-6: 360 px, Requester and Technician screens (AC-NFR-1.2)', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const assigned = await insertRequest(campus, requester, { status: STATUS.ASSIGNED, assignee: technician });
  const problems = [];

  const req = await openSession(browser, baseURL, { viewport: VIEWPORT_360 });
  const tech = await openSession(browser, baseURL, { viewport: VIEWPORT_360 });

  try {
    await test.step('Requester screens', async () => {
      const { page } = req;
      await page.goto('/requests/new');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await checkScreen(page, 'Requester: sign-in', problems);

      await goAs(page, '/requests/new', requester);
      await expect(page.getByRole('radio', { name: BRIEF_CATEGORY_NAME })).toBeVisible();
      await checkScreen(page, 'Requester: New request', problems);

      await page.getByRole('radio', { name: BRIEF_CATEGORY_NAME }).check();
      await page.getByLabel('Location').fill(`E2E ${campus.runId} corridor`);
      await page.getByLabel('Description').fill(`E2E ${campus.runId} light out`);
      await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests')),
        page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      await expect(page.getByTestId('submitted-reference')).toBeVisible();
      await checkScreen(page, 'Requester: confirmation', problems);

      await goAs(page, '/requests/mine', requester);
      await expect(page.getByRole('link', { name: new RegExp(STATUS.RECEIVED) })).toBeVisible();
      await checkScreen(page, 'Requester: My requests', problems);

      await goAs(page, `/requests/${assigned.requestId}`, requester);
      await expect(page.getByTestId('reference')).toHaveText(assigned.reference);
      await checkScreen(page, 'Requester: request page', problems);

      await goAs(page, '/notifications', requester);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await checkScreen(page, 'Requester: notifications', problems);
    });

    await test.step('Technician screens', async () => {
      const { page } = tech;
      await page.goto('/requests');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await checkScreen(page, 'Technician: sign-in', problems);

      await goAs(page, '/requests', technician);
      await expect(page.getByRole('row', { name: new RegExp(assigned.reference) })).toBeVisible();
      await checkScreen(page, 'Technician: request queue', problems);

      await goAs(page, `/requests/${assigned.requestId}`, technician);
      await expect(page.getByRole('region', { name: 'Update status' })).toBeVisible();
      await checkScreen(page, 'Technician: request page with Update status', problems);

      await goAs(page, '/notifications', technician);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await checkScreen(page, 'Technician: notifications', problems);
    });
  } finally {
    await Promise.all([req.context.close(), tech.context.close()]);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

/**
 * E2E-13: the same AC at 360 px, measured after each interaction, not only on arrival.
 *
 * Basis: AC-NFR-1.2, "when each Requester and Technician function is exercised". E2E-6
 * measures each screen as it opens; the controls an interaction brings up (field errors,
 * a filter applied, the resolution box, a confirmation) were never measured.
 *
 * Expected results, written before the first run from the AC (strict reading):
 *  After every numbered interaction below, at 360 x 740:
 *   - document.documentElement.scrollWidth is at most 360;
 *   - every rendered control is at least 44 x 44 (threshold 43.99);
 *   - no box inside the page scrolls sideways while holding a control
 *     (innerScrollers is empty): "no horizontal scrolling is required" applies to a
 *     control reached by scrolling a box sideways as much as to the page.
 *  Requester: R1 Submit with nothing filled (field errors shown); R2 a status chip
 *  chosen on My requests; R3 text typed in "Add more detail"; R4 the detail added
 *  (201, confirmation shown).
 *  Technician: T1 a search applied; T2 the Unassigned filter on; T3 Accept on an
 *  unassigned request's row (201); T4 Resolved chosen (the resolution box shown);
 *  T5 the transition submitted (201); T6 a comment posted (201).
 *  Prediction from the code before the run: the queue is a table with min-width 880 px
 *  inside an overflow-x box, and the My requests status chips are one sideways-scrolling
 *  row, so innerScrollers is expected NOT to be empty at R2, T1, T2 and T3. If so, the
 *  test fails and the failure lists them; AC-NFR-1.2 stays Partial until that changes.
 *
 * Shows: the measurements after each listed interaction, on the built client against
 * the real server.
 * Does NOT show: other widths, zoom, touch input, the Coordinator, Manager or
 * Administrator screens, or interactions not listed.
 */
async function checkAfter(page, name, problems) {
  await checkScreen(page, name, problems);
  const { innerScrollers } = await measure(page);
  for (const s of innerScrollers) {
    problems.push(`${name}: sideways scrolling box "${s.name}" (${s.scrollWidth} > ${s.clientWidth}) holds controls`);
  }
}

test('E2E-13: 360 px, measured after each Requester and Technician interaction (AC-NFR-1.2)', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const own = await insertRequest(campus, requester);
  const open = await insertRequest(campus, requester);
  const working = await insertRequest(campus, requester, { status: STATUS.IN_PROGRESS, assignee: technician });
  const problems = [];

  const req = await openSession(browser, baseURL, { viewport: VIEWPORT_360 });
  const tech = await openSession(browser, baseURL, { viewport: VIEWPORT_360 });
  try {
    await test.step('Requester interactions', async () => {
      const { page } = req;
      await goAs(page, '/requests/new', requester);
      const [empty] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests')),
        page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      expect(empty.status()).toBe(400);
      await expect(page.getByText('Choose a category.')).toBeVisible();
      await checkAfter(page, 'R1 Requester: New request with field errors', problems);

      await goAs(page, '/requests/mine', requester);
      await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: STATUS.RECEIVED }).click();
      await expect(page.getByRole('link', { name: new RegExp(own.reference) })).toBeVisible();
      await checkAfter(page, 'R2 Requester: My requests, status chip chosen', problems);

      await goAs(page, `/requests/${own.requestId}`, requester);
      await page.getByLabel('Add more detail').fill(`E2E ${campus.runId} it is the left-hand light`);
      await checkAfter(page, 'R3 Requester: detail typed', problems);
      const [detail] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${own.requestId}/details`)),
        page.getByRole('button', { name: 'Add detail' }).click(),
      ]);
      expect(detail.status()).toBe(201);
      await expect(page.getByRole('status').filter({ hasText: 'Detail added.' })).toBeVisible();
      await checkAfter(page, 'R4 Requester: detail added', problems);
    });

    await test.step('Technician interactions', async () => {
      const { page } = tech;
      await goAs(page, '/requests', technician);
      await expect(page.getByRole('row', { name: new RegExp(open.reference) })).toBeVisible();
      // Each measurement waits for the list the interaction asked for to be on screen: a
      // reload empties the list first, so a listed row means the new data has rendered.
      const rowOf = (r) => page.getByRole('row', { name: new RegExp(r.reference) });
      const isList = (unassignedOnly) => (r) => isGetPath('/api/v1/requests')(r)
        && (new URL(r.url()).searchParams.get('assigneeId') === 'none') === unassignedOnly;

      await page.getByLabel('Search requests').fill(campus.runId);
      await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests/search')),
        page.getByRole('button', { name: 'Search', exact: true }).click(),
      ]);
      await expect(rowOf(open)).toBeVisible();
      await checkAfter(page, 'T1 Technician: search applied', problems);
      await Promise.all([
        page.waitForResponse(isList(false)),
        page.getByRole('button', { name: 'Clear search' }).click(),
      ]);
      await expect(rowOf(working)).toBeVisible();

      await Promise.all([
        page.waitForResponse(isList(true)),
        page.getByRole('button', { name: 'Unassigned' }).click(),
      ]);
      await expect(rowOf(open)).toBeVisible();
      await expect(rowOf(working)).toHaveCount(0);           // assigned, so not in the Unassigned list
      await checkAfter(page, 'T2 Technician: Unassigned filter on', problems);

      const [accept] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${open.requestId}/assignments`)),
        page.waitForResponse(isList(true)),                  // the list reloaded after it
        rowOf(open).getByRole('button', { name: 'Accept' }).click(),
      ]);
      expect(accept.status()).toBe(201);
      await expect(rowOf(own)).toBeVisible();                // still unassigned
      await expect(rowOf(open)).toHaveCount(0);              // accepted, so no longer listed
      await checkAfter(page, 'T3 Technician: request accepted', problems);

      await goAs(page, `/requests/${working.requestId}`, technician);
      await page.getByLabel('New status').selectOption(STATUS.RESOLVED);
      await expect(page.getByLabel('Resolution')).toBeVisible();
      await checkAfter(page, 'T4 Technician: Resolved chosen', problems);
      await page.getByLabel('Reason', { exact: true }).fill(`E2E ${campus.runId} fixed`);
      await page.getByLabel('Resolution').fill(`E2E ${campus.runId} lamp replaced`);
      const [moved] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${working.requestId}/transitions`)),
        page.getByRole('button', { name: 'Submit transition' }).click(),
      ]);
      expect(moved.status()).toBe(201);
      await expect(page.getByTestId('status')).toHaveText(STATUS.RESOLVED);
      // The history reloads after the move and pushes the Notes panel down: wait for the entry.
      await expect(page.getByRole('list', { name: 'Changes' }).locator('.timeline__title', { hasText: new RegExp(`^${STATUS.RESOLVED}$`) })).toHaveCount(1);
      await checkAfter(page, 'T5 Technician: transition submitted', problems);

      await page.getByLabel('Add a comment').fill(`E2E ${campus.runId} checked twice`);
      const [comment] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${working.requestId}/comments`)),
        page.getByRole('button', { name: 'Post comment' }).click(),
      ]);
      expect(comment.status()).toBe(201);
      await checkAfter(page, 'T6 Technician: comment posted', problems);
    });
  } finally {
    await Promise.all([req.context.close(), tech.context.close()]);
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

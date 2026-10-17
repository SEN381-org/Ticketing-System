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
import { openSession, goAs, isPost } from './support/session.js';
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

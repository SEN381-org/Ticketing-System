/**
 * E2E-11: a staff user sees the full detail of a request (AC-FR-4.2).
 * E2E-12: a staff user finds a request by a term in its description, through the
 *         real text index (AC-FR-4.3).
 *
 * Basis:
 *  AC-FR-4.2 (FR-4.2): given a staff user authorised to view a request, when that
 *  user opens it, then the category, location, description, status, submission
 *  details, assignment, comment history and action history are all displayed.
 *  AC-FR-4.3 (FR-4.3): given a data set containing a request whose description
 *  contains a chosen term, when a staff user searches for that term, then the
 *  request appears in the results.
 * Case: DEC-019 (Context).
 *
 * Expected results, written before the first run from the two ACs:
 *  E2E-11. Every write goes through the user interface: the Requester submits, the
 *  Coordinator assigns to the Technician, the Technician posts one comment and
 *  records one action. Then the Coordinator opens the request in a new session and
 *  the page shows, from the server:
 *   - category: the heading is the category name, 'facility faults';
 *   - location and description: exactly the typed texts;
 *   - status: the badge reads Assigned (FR-6.1 value, imported);
 *   - submission details: a "Submitted" fact with a date and time, and the first
 *     history item "Request submitted" naming the role Requester;
 *   - assignment: an "Assignee" fact with the Technician's display name, and an
 *     "Assignment" history item with "To: <Technician's name>";
 *   - comment history: a "Comment" item with the comment text;
 *   - action history: an "Action taken" item with the action text.
 *  E2E-12. In one campus, request A's description contains a term made for this run
 *  (a single word, so the text index tokenises it as one word); request B's does
 *  not. A second campus holds request C, which also contains the term. The
 *  Technician of the first campus types the term in the queue's search box and
 *  presses Search. The search call is POST /api/v1/requests/search with 200; the
 *  results show A's reference, and neither B's nor C's (C is in another campus and
 *  category, so it is outside the Technician's scope).
 *  Then Clear search: B's reference is listed again.
 *
 * Shows: the eight AC-FR-4.2 items on the built client against the real server; a
 * search answered by MongoDB's own $text index on the test cluster (the HTTP tests
 * use a fake evaluator).
 * Does NOT show: the submitter's name (the page shows the role and the time; FR-2.5's
 * "submitting user" is a stored identifier, and the client resolves names for staff
 * only); search by reference, category or location (FR-4.3 lists them; AC-FR-4.3
 * names description text only); substring or stemming behaviour of the index; other
 * staff roles than the Coordinator (E2E-11) and the Technician (E2E-12).
 * Assertions are scoped to this run's campus, requests and users (DEF-006).
 */
import { test, expect } from '@playwright/test';

import { ROLE, STATUS } from '../shared/domainValues.js';
import { useCluster } from './support/cluster.js';
import { createCampus, addUser, insertRequest, BRIEF_CATEGORY_NAME } from './support/campus.js';
import { openSession, goAs, isPost } from './support/session.js';

useCluster();

/** The <dd> that follows the <dt> with this label, inside the request card. */
const fact = (card, label) => card.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');

test('E2E-11: a Coordinator sees every AC-FR-4.2 item on the request page', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const coordinator = await addUser(campus, ROLE.COORDINATOR);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const location = `E2E ${campus.runId} block C stairwell`;
  const description = `E2E ${campus.runId} handrail loose on the second landing`;
  const comment = `E2E ${campus.runId} comment: inspected, needs two bolts`;
  const action = `E2E ${campus.runId} action: bolts ordered from stores`;

  const req = await openSession(browser, baseURL);
  const coord = await openSession(browser, baseURL);
  const tech = await openSession(browser, baseURL);
  const viewer = await openSession(browser, baseURL);
  let requestId;
  try {
    await test.step('the Requester submits the request', async () => {
      const { page } = req;
      await goAs(page, '/requests/new', requester);
      await page.getByRole('radio', { name: BRIEF_CATEGORY_NAME }).check();
      await page.getByLabel('Location').fill(location);
      await page.getByLabel('Description').fill(description);
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests')),
        page.getByRole('button', { name: 'Submit request' }).click(),
      ]);
      expect(response.status()).toBe(201);
      requestId = (await response.json()).id;
      expect(requestId).toBeTruthy();
    });

    await test.step('the Coordinator assigns it to the Technician', async () => {
      const { page } = coord;
      await goAs(page, `/requests/${requestId}`, coordinator);
      await page.getByLabel('Assign to').selectOption({ label: technician.displayName });
      const [response] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${requestId}/assignments`)),
        page.getByRole('button', { name: 'Assign request' }).click(),
      ]);
      expect(response.status()).toBe(201);
    });

    await test.step('the Technician posts a comment and records an action', async () => {
      const { page } = tech;
      await goAs(page, `/requests/${requestId}`, technician);
      await page.getByLabel('Add a comment').fill(comment);
      const [c] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${requestId}/comments`)),
        page.getByRole('button', { name: 'Post comment' }).click(),
      ]);
      expect(c.status()).toBe(201);
      await page.getByLabel('Record an action').fill(action);
      const [a] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/requests/${requestId}/actions`)),
        page.getByRole('button', { name: 'Record action' }).click(),
      ]);
      expect(a.status()).toBe(201);
    });

    await test.step('a fresh Coordinator session opens it: all eight items are displayed', async () => {
      const { page } = viewer;
      await goAs(page, `/requests/${requestId}`, coordinator);
      const card = page.getByRole('region', { name: 'Request' });
      await expect(card.getByRole('heading', { level: 1 })).toHaveText(BRIEF_CATEGORY_NAME);   // category
      await expect(fact(card, 'Location')).toHaveText(location);                              // location
      await expect(card.getByText(description, { exact: true })).toBeVisible();              // description
      await expect(page.getByTestId('status')).toHaveText(STATUS.ASSIGNED);                   // status
      await expect(fact(card, 'Submitted')).toHaveText(/\d{1,2} \w{3} \d{4}, \d{2}:\d{2}/);   // submission details
      await expect(fact(card, 'Assignee')).toHaveText(technician.displayName);                // assignment

      const items = page.getByRole('list', { name: 'Changes' }).getByRole('listitem');
      const submitted = items.filter({ hasText: 'Request submitted' });
      await expect(submitted).toHaveCount(1);
      await expect(submitted).toContainText(ROLE.REQUESTER);
      await expect(items.first()).toContainText('Request submitted');
      await expect(items.filter({ hasText: 'Assignment' })).toContainText(`To: ${technician.displayName}`);
      await expect(items.filter({ hasText: comment })).toHaveCount(1);                       // comment history
      await expect(items.filter({ hasText: comment })).toContainText('Comment');
      await expect(items.filter({ hasText: action })).toHaveCount(1);                        // action history
      await expect(items.filter({ hasText: action })).toContainText('Action taken');
    });
  } finally {
    await Promise.all([req, coord, tech, viewer].map((s) => s.context.close()));
  }
});

test('E2E-12: a Technician finds a request by a description term, through the text index', async ({ browser, baseURL }) => {
  const campus = await createCampus();
  const elsewhere = await createCampus();
  const requester = await addUser(campus, ROLE.REQUESTER);
  const technician = await addUser(campus, ROLE.TECHNICIAN);
  const farRequester = await addUser(elsewhere, ROLE.REQUESTER);
  const term = `zqterm${campus.runId}`;                       // one word for the text index
  const a = await insertRequest(campus, requester, { description: `Water stain spreading ${term} near the window` });
  const b = await insertRequest(campus, requester, { description: `E2E ${campus.runId} unrelated broken chair` });
  const c = await insertRequest(elsewhere, farRequester, { description: `Same word ${term} in another campus` });

  const { context, page } = await openSession(browser, baseURL);
  try {
    await goAs(page, '/requests', technician);
    await expect(page.getByRole('row', { name: new RegExp(b.reference) })).toBeVisible();

    await test.step('search for the term: only request A is listed', async () => {
      await page.getByLabel('Search requests').fill(term);
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/requests/search')),
        page.getByRole('button', { name: 'Search', exact: true }).click(),
      ]);
      expect(response.status()).toBe(200);
      await expect(page.getByRole('row', { name: new RegExp(a.reference) })).toBeVisible();
      await expect(page.getByRole('row', { name: new RegExp(b.reference) })).toHaveCount(0);
      await expect(page.getByRole('row', { name: new RegExp(c.reference) })).toHaveCount(0);
    });

    await test.step('Clear search: request B is listed again', async () => {
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(page.getByRole('row', { name: new RegExp(b.reference) })).toBeVisible();
    });
  } finally {
    await context.close();
  }
});

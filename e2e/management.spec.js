/**
 * E2E-5: a Manager reads the management view, in a real Chromium session.
 *
 * Basis: AC-FR-8.1 (counts per status sum to the total within the filter),
 * AC-FR-8.2 (counts per category), FR-8.5 (the category filter narrows both).
 * Case: DEC-019 (Context).
 *
 * Fixture: a fresh campus (so every count is exact; the view is campus-scoped),
 * two categories, and nine requests written straight to the collection:
 *   facility faults:  3 Received, 2 In Progress, 1 Resolved, 1 Closed   (7)
 *   the second one:   1 Received, 1 Rejected                            (2)
 * The counts below are fixed in this header and in these constants, not read back
 * from the page or from the database.
 *
 * Expected results, written before the first run:
 *  1. With no filter the Total tile reads 9. The status rows read Received 4,
 *     Assigned 0, In Progress 2, On Hold 0, Resolved 1, Closed 1, Rejected 1,
 *     and they sum to the Total tile (AC-FR-8.1). The category rows read
 *     facility faults 7 and the second category 2, summing to 9 (AC-FR-8.2).
 *  2. The numbers shown equal what is stored: the campus holds 9 requests.
 *  3. Filtered to facility faults the Total tile reads 7, the status rows sum to
 *     7 (Received 3, In Progress 2, Resolved 1, Closed 1, others 0), and the
 *     category list holds facility faults at 7 (AC-FR-8.1 "within the filter").
 *
 * Shows: the sum rule and the per-category count as the Manager sees them, for
 * the whole campus and inside a category filter, against stored data.
 * Does NOT show: the date-range filter (FR-8.5), overdue requests (FR-8.3), that
 * the counts follow a transition made through the interface, security-category
 * counts (FR-8.6), any role other than Manager, non-Chromium browsers.
 */
import { test, expect } from '@playwright/test';

import { STATUS, ROLE } from '../shared/domainValues.js';
import { useCluster } from './support/cluster.js';
import { createCampus, addUser, insertRequest, campusRequests, BRIEF_CATEGORY_NAME } from './support/campus.js';
import { openSession, goAs, isGetPath } from './support/session.js';

useCluster();

const MAIN = [
  [STATUS.RECEIVED, 3], [STATUS.IN_PROGRESS, 2], [STATUS.RESOLVED, 1], [STATUS.CLOSED, 1],
];
const OTHER = [[STATUS.RECEIVED, 1], [STATUS.REJECTED, 1]];

const sum = (counts) => counts.reduce((a, b) => a + b, 0);

/** Reads each meter row as { label, n } from its two spans (a name may itself end in digits). */
async function meters(section) {
  const rows = await section.locator('.meter').evaluateAll((els) => els.map((el) => ({
    label: el.querySelector('.meter__top > span:first-child').textContent.trim(),
    n: el.querySelector('.meter__n').textContent.trim(),
  })));
  return rows.map((r) => ({ label: r.label, n: Number(r.n) }));
}

const byLabel = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.n]));

test('E2E-5: Manager management view (AC-FR-8.1, AC-FR-8.2)', async ({ browser, baseURL }) => {
  const campus = await createCampus({ withSecondCategory: true });
  const manager = await addUser(campus, ROLE.MANAGER);
  const requester = await addUser(campus, ROLE.REQUESTER);
  for (const [status, n] of MAIN) for (let i = 0; i < n; i += 1) await insertRequest(campus, requester, { status });
  for (const [status, n] of OTHER) for (let i = 0; i < n; i += 1) await insertRequest(campus, requester, { status, categoryId: campus.other._id });
  const otherName = campus.other.name;
  const { context, page } = await openSession(browser, baseURL);

  try {
    await test.step('1. unfiltered: statuses and categories each sum to the total', async () => {
      const [summary] = await Promise.all([
        page.waitForResponse(isGetPath('/api/v1/reports/summary')),
        goAs(page, '/management', manager),
      ]);
      expect(summary.status()).toBe(200);
      await expect(page.getByTestId('total')).toHaveText('9');

      const statusRows = await meters(page.locator('section', { has: page.getByRole('heading', { name: 'By status' }) }));
      const counts = byLabel(statusRows);
      expect(counts).toEqual({
        [STATUS.RECEIVED]: 4, [STATUS.ASSIGNED]: 0, [STATUS.IN_PROGRESS]: 2, [STATUS.ON_HOLD]: 0,
        [STATUS.RESOLVED]: 1, [STATUS.CLOSED]: 1, [STATUS.REJECTED]: 1,
      });
      expect(sum(statusRows.map((r) => r.n))).toBe(9);                     // AC-FR-8.1

      const categoryRows = await meters(page.locator('section', { has: page.getByRole('heading', { name: 'By category' }) }));
      expect(byLabel(categoryRows)).toEqual({ [BRIEF_CATEGORY_NAME]: 7, [otherName]: 2 });   // AC-FR-8.2
      expect(sum(categoryRows.map((r) => r.n))).toBe(9);
    });

    await test.step('2. the numbers shown are what is stored', async () => {
      expect(await campusRequests(campus.campusId)).toHaveLength(9);
    });

    await test.step('3. filtered to one category: the sum rule holds inside the filter', async () => {
      const [summary] = await Promise.all([
        page.waitForResponse((r) => isGetPath('/api/v1/reports/summary')(r) && r.url().includes('categoryId=')),
        page.getByLabel('Category', { exact: true }).selectOption({ label: BRIEF_CATEGORY_NAME }),
      ]);
      expect(summary.status()).toBe(200);
      await expect(page.getByTestId('total')).toHaveText('7');

      const statusRows = await meters(page.locator('section', { has: page.getByRole('heading', { name: 'By status' }) }));
      expect(byLabel(statusRows)).toEqual({
        [STATUS.RECEIVED]: 3, [STATUS.ASSIGNED]: 0, [STATUS.IN_PROGRESS]: 2, [STATUS.ON_HOLD]: 0,
        [STATUS.RESOLVED]: 1, [STATUS.CLOSED]: 1, [STATUS.REJECTED]: 0,
      });
      expect(sum(statusRows.map((r) => r.n))).toBe(7);                     // AC-FR-8.1 within the filter

      const categoryRows = await meters(page.locator('section', { has: page.getByRole('heading', { name: 'By category' }) }));
      expect(byLabel(categoryRows)[BRIEF_CATEGORY_NAME]).toBe(7);
    });
  } finally {
    await context.close();
  }
});

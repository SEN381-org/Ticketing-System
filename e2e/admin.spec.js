/**
 * E2E-7: an Administrator manages users and categories, in real Chromium sessions.
 *
 * Basis: AC-FR-1.2 (a user without a role is refused with "A role is required" and
 * nothing is stored), AC-FR-1.4 (create, change roles, revoke: a revoked user cannot sign in
 * and an open session ends), AC-FR-9.1 (a deactivated category is no longer offered
 * to a Requester on the New request form), FR-1.2 (roles are the six of the controlled
 * set), DEC-015 Addendum A (A2 to A5 user routes, A7/A8 category routes), DEC-018 (one
 * 401 for every refused sign-in), the client changes of 17/10/2026 (every write sends a
 * JSON body: the "Save roles 415" and revoke 415 reports; a revoked user listed as
 * Revoked). Case: DEC-019 (Context).
 *
 * The initial password of the created user is generated in the test, typed into the
 * form and used to sign in; it is never written to a log, an annotation or a title.
 *
 * Expected results, written before the first run from those sources:
 *  1. Administrator on Users: a user created with e-mail, name, password and NO role
 *     is answered 400 with detail exactly "A role is required"; the alert shows it;
 *     no user with that e-mail is stored and no row for the name is listed.
 *  2. The Technician role ticked and the form submitted again: 201 and a body of
 *     exactly id, email, displayName, roles; a row with the name and e-mail is listed with
 *     Technician ticked; stored: roles [Technician], status active.
 *  3. Coordinator ticked on that row and Save roles clicked: 200 (a 415 here is the
 *     reported defect and fails the case); stored roles are exactly Technician and
 *     Coordinator; after a page reload both stay ticked.
 *  4. The created user signs in in their own session (201), proving the password works.
 *  5. Revoke access: 201; the row reads Revoked with no Revoke access and no Save roles
 *     buttons, also after a reload; stored status revoked and revokedAt set.
 *  6. The created user's open session ends (their next page asks for sign-in) and
 *     signing in again with the same, correct, credentials is answered 401 with an alert
 *     and no signed-in shell (AC-FR-1.4).
 *  7. Categories: a Requester's New request form offers both categories; the Administrator
 *     deactivates the second; the response is 201 with active false; stored active false
 *     (the first category stays true); the Categories page no longer lists it; after a
 *     reload the Requester's form offers only the first (AC-FR-9.1).
 *
 * Shows: the six client writes of the Administrator screen reaching the server with a
 * body, and their stored effect; the refusal of a roleless user; revocation ending
 * access. Does NOT show: categoryAuthorisations at creation; idempotent replays; that
 * a non-Administrator is refused (tests/ cover it); target hours (Manager); the e-mail
 * being withheld from other roles; non-Chromium behaviour beyond what the four projects run.
 * Assertions are scoped to this fixture's campus and users (DEF-006).
 */
import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';

import { ROLE } from '../shared/domainValues.js';
import Category from '../src/models/Category.js';
import User from '../src/models/User.js';
import { useCluster } from './support/cluster.js';
import { createCampus, addUser, BRIEF_CATEGORY_NAME } from './support/campus.js';
import { openSession, goAs, isPost } from './support/session.js';
import { isSessionPost } from './support/ui.js';

useCluster();

const isPut = (pathname) => (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === pathname;

test('E2E-7: Administrator manages users and categories (AC-FR-1.2, AC-FR-1.4, AC-FR-9.1)', async ({ browser, baseURL }) => {
  const campus = await createCampus({ withSecondCategory: true });
  const admin = await addUser(campus, ROLE.ADMINISTRATOR);
  const requester = await addUser(campus, ROLE.REQUESTER);
  const email = `${campus.runId}-created@example.test`;
  const displayName = `E2E created ${campus.runId}`;
  const password = randomBytes(18).toString('base64url');   // typed and used, never logged

  const adminSession = await openSession(browser, baseURL);
  const { page } = adminSession;
  const sessions = [adminSession];
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Create a user' }) });
  const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: displayName, exact: true }) });
  const storedByEmail = () => User.findOne({ campusId: campus.campusId, email }).lean();

  try {
    await test.step('1. no role: refused "A role is required", nothing stored (AC-FR-1.2)', async () => {
      await goAs(page, '/admin/users', admin);
      await form.getByLabel('User email').fill(email);
      await form.getByLabel('Display name').fill(displayName);
      await form.getByLabel('Initial password').fill(password);
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/users')),
        form.getByRole('button', { name: 'Create user' }).click(),
      ]);
      expect(response.status()).toBe(400);
      expect((await response.json()).detail).toBe('A role is required');
      await expect(form.getByRole('alert')).toContainText('A role is required');
      expect(await storedByEmail()).toBeNull();
      await expect(row).toHaveCount(0);
    });

    let userId;
    await test.step('2. Technician role: created and listed (AC-FR-1.2, FR-1.4)', async () => {
      await form.getByLabel(ROLE.TECHNICIAN, { exact: true }).check();
      const [response] = await Promise.all([
        page.waitForResponse(isPost('/api/v1/users')),
        form.getByRole('button', { name: 'Create user' }).click(),
      ]);
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(['displayName', 'email', 'id', 'roles']);
      expect(body.roles).toEqual([ROLE.TECHNICIAN]);
      userId = body.id;

      await expect(row).toHaveCount(1);
      await expect(row).toContainText(email);
      await expect(row.getByLabel(ROLE.TECHNICIAN, { exact: true })).toBeChecked();
      const stored = await storedByEmail();
      expect(stored.roles).toEqual([ROLE.TECHNICIAN]);
      expect(stored.status).toBe('active');
    });

    await test.step('3. roles changed to Technician and Coordinator with Save roles (A2/A4)', async () => {
      await row.getByLabel(ROLE.COORDINATOR, { exact: true }).check();
      const [response] = await Promise.all([
        page.waitForResponse(isPut(`/api/v1/users/${userId}/roles`)),
        row.getByRole('button', { name: 'Save roles' }).click(),
      ]);
      expect(response.status()).toBe(200);                 // 415 here is the reported defect
      const stored = await storedByEmail();
      expect([...stored.roles].sort()).toEqual([ROLE.COORDINATOR, ROLE.TECHNICIAN]);

      await page.reload();
      await expect(row).toHaveCount(1);
      await expect(row.getByLabel(ROLE.TECHNICIAN, { exact: true })).toBeChecked();
      await expect(row.getByLabel(ROLE.COORDINATOR, { exact: true })).toBeChecked();
    });

    const created = await openSession(browser, baseURL);
    sessions.push(created);
    await test.step('4. the created user signs in with the password that was set', async () => {
      await goAs(created.page, '/requests', { email, password });
      await expect(created.page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    });

    await test.step('5. Revoke access: listed as Revoked, no controls, status revoked (AC-FR-1.4)', async () => {
      await row.getByRole('button', { name: 'Revoke access' }).click();      // asks first
      const [response] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/users/${userId}/revocation`)),
        row.getByRole('button', { name: 'Confirm' }).click(),
      ]);
      expect(response.status()).toBe(201);
      await expect(row.locator('strong')).toHaveText('Revoked');
      await expect(row.getByRole('button', { name: 'Revoke access' })).toHaveCount(0);
      await expect(row.getByRole('button', { name: 'Save roles' })).toHaveCount(0);

      const stored = await storedByEmail();
      expect(stored.status).toBe('revoked');
      expect(stored.revokedAt).toBeTruthy();

      await page.reload();                                 // the server still lists it, as Revoked
      await expect(row).toHaveCount(1);
      await expect(row.locator('strong')).toHaveText('Revoked');
      await expect(row.getByRole('button', { name: 'Revoke access' })).toHaveCount(0);
    });

    await test.step('6. the open session ends and sign-in is refused (AC-FR-1.4)', async () => {
      await created.page.goto('/requests');
      await expect(created.page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await expect(created.page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

      await created.page.getByLabel('Email').fill(email);
      await created.page.getByLabel('Password').fill(password);
      const [response] = await Promise.all([
        created.page.waitForResponse(isSessionPost),
        created.page.getByRole('button', { name: 'Sign in' }).click(),
      ]);
      expect(response.status()).toBe(401);                 // DEC-018 section 5
      expect((await response.json()).code).toBe('UNAUTHENTICATED');
      await expect(created.page.getByRole('alert')).toContainText('UNAUTHENTICATED');
      await expect(created.page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    });

    await test.step('7. a deactivated category is no longer offered to a Requester (AC-FR-9.1)', async () => {
      const other = campus.other;
      const req = await openSession(browser, baseURL);
      sessions.push(req);
      await goAs(req.page, '/requests/new', requester);
      await expect(req.page.getByRole('radio', { name: BRIEF_CATEGORY_NAME })).toBeVisible();
      await expect(req.page.getByRole('radio', { name: other.name })).toBeVisible();   // offered before

      await goAs(page, '/admin/categories', admin);
      await page.getByRole('button', { name: `Deactivate ${other.name}` }).click();   // asks first
      const [response] = await Promise.all([
        page.waitForResponse(isPost(`/api/v1/categories/${other._id}/deactivation`)),
        page.getByRole('button', { name: 'Confirm' }).click(),
      ]);
      expect(response.status()).toBe(201);
      expect((await response.json()).active).toBe(false);
      expect((await Category.findById(other._id).lean()).active).toBe(false);
      expect((await Category.findById(campus.categoryId).lean()).active).toBe(true);
      // Still listed for the Administrator (FR-9.2), marked Deactivated, with no Deactivate button
      await expect(page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: other.name }) })).toContainText('Deactivated');
      await expect(page.getByRole('button', { name: `Deactivate ${other.name}` })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: BRIEF_CATEGORY_NAME })).toBeVisible();

      await req.page.reload();
      await expect(req.page.getByRole('radio', { name: BRIEF_CATEGORY_NAME })).toBeVisible();
      await expect(req.page.getByRole('radio', { name: other.name })).toHaveCount(0);
    });
  } finally {
    await Promise.all(sessions.map((s) => s.context.close()));
  }
});

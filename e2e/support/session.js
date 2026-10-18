/**
 * Browser sessions for the role journeys. One browser context per person, so a
 * cookie (DEC-018 __Host-sid) and the tab's sessionStorage never leak from one
 * role to the next. A context made with browser.newContext() does not inherit
 * the config's `use` options, so baseURL is passed here.
 */
import { expect } from '@playwright/test';

import { isSessionPost } from './ui.js';

/** @returns {Promise<{context, page}>} */
export async function openSession(browser, baseURL, { viewport } = {}) {
  const context = await browser.newContext({ baseURL, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  return { context, page };
}

/** Fills the sign-in prompt that is on screen and waits for the 201 and the signed-in shell. */
export async function signInAs(page, { email, password }) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(isSessionPost),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  expect(response.status()).toBe(201);                 // DEC-018 section 5
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  return response;
}

/**
 * Goes to a client address. If the sign-in prompt is shown in place (the
 * address is gated, or the session is not yet established) the person signs in.
 */
export async function goAs(page, path, credentials) {
  await page.goto(path);
  const prompt = page.getByRole('button', { name: 'Sign in' });
  const out = page.getByRole('button', { name: 'Sign out' });
  await expect(prompt.or(out)).toBeVisible();
  if (await prompt.isVisible()) await signInAs(page, credentials);
}

export const isPost = (pathname) => (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === pathname;
export const isGetPath = (pathname) => (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === pathname;

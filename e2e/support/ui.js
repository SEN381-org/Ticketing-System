import { expect } from '@playwright/test';

const requestPath = (id) => `/api/v1/requests/${id}`;

export const isGet = (id) => (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === requestPath(id);
export const isTransition = (id) => (r) => r.request().method() === 'POST'
  && new URL(r.url()).pathname === `${requestPath(id)}/transitions`;
export const isSessionPost = (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/sessions';

/**
 * Signs in through the sign-in prompt. Returns the sign-in response and the GET that follows it.
 * The waits are registered before the click, so neither response can be missed.
 */
export async function signInViaForm(page, id, { email, password }) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const [signIn, get] = await Promise.all([
    page.waitForResponse(isSessionPost),
    page.waitForResponse(isGet(id)),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  return { signIn, get };
}

/** Opens the detail address signed out and returns the first GET. */
export async function openSignedOut(page, id) {
  const [get] = await Promise.all([page.waitForResponse(isGet(id)), page.goto(`/requests/${id}`)]);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  return get;
}

/**
 * A refusal must disclose nothing about the request: no `reference`, no `version`.
 * An RFC 9457 problem body has its own `status` member (DEC-015 §4); that is the HTTP status
 * as a number, so a request status (a string such as a STATUS value) there would be a leak.
 */
export function expectNoRequestData(body, httpStatus) {
  expect(body).not.toHaveProperty('reference');
  expect(body).not.toHaveProperty('version');
  if ('status' in body) expect(body.status).toBe(httpStatus);
}

/**
 * Create a user account from the host — DEC-018 §7.
 *
 * Traces to: FR-1.1, FR-1.2, AC-FR-1.2, NFR-1.4, NFR-3.1, NFR-3.5.
 *
 * This is how the first Administrator exists. FR-1.4's administration functions
 * are not built, and there is deliberately no HTTP bootstrap endpoint (an
 * unauthenticated account-creation route is the first thing CON-019 testing
 * would try) and no default credential.
 *
 * The password is read from an interactive prompt only: never from an argument
 * (visible in `ps` and shell history) or an environment variable (visible in
 * /proc and in the env file). A non-interactive run is refused.
 *
 * Usage (on the host, under the environment's configuration):
 *   node --env-file=/etc/civicconnect/<env>.env scripts/admin/create-user.js \
 *     --email admin@example.org --name "Display Name" --roles Administrator \
 *     --campus <campusId> [--categories <categoryId>,<categoryId>]
 */

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database.js';
import { hashPassword } from '../../src/infrastructure/passwordHasher.js';
import { userRepository } from '../../src/repositories/userRepository.js';
import { auditRepository } from '../../src/repositories/auditRepository.js';
import { ROLE } from '../../src/models/_shared.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.output.write('\n'); rl.close(); resolve(answer); });
  });
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' }, name: { type: 'string' }, roles: { type: 'string' },
    campus: { type: 'string' }, categories: { type: 'string' },
  },
});

if (!process.stdin.isTTY) fail('Refused: run this interactively. The password is read from a prompt only.');
if (!process.env.MONGODB_URI) fail('MONGODB_URI is not set. Run with --env-file for the target environment.');
for (const key of ['email', 'name', 'roles', 'campus']) {
  if (!values[key]) fail(`--${key} is required`);
}

// FR-1.2 — the controlled role set, compared with the imported values, never retyped.
const roles = values.roles.split(',').map((r) => r.trim()).filter(Boolean);
const unknownRoles = roles.filter((r) => !Object.values(ROLE).includes(r));
if (roles.length === 0) fail('At least one role is required (AC-FR-1.2)');
if (unknownRoles.length > 0) {
  fail(`Not an FR-1.2 role: ${unknownRoles.join(', ')}. Roles: ${Object.values(ROLE).join(', ')}`);
}

const toId = (v, what) => {
  if (!mongoose.isValidObjectId(v)) fail(`--${what} value '${v}' is not an ObjectId`);
  return new mongoose.Types.ObjectId(v);
};
const campusId = toId(values.campus, 'campus');
const categoryAuthorisations = (values.categories ?? '').split(',').filter(Boolean)
  .map((v) => toId(v.trim(), 'categories'));

const password = await promptHidden('Password: ');
const confirm = await promptHidden('Repeat password: ');
if (password !== confirm) fail('The passwords do not match. Nothing was created.');
if (password.length === 0) fail('An empty password is refused. Nothing was created.');

await connectDatabase(process.env.MONGODB_URI);
try {
  const user = await userRepository.create({
    campusId, email: values.email, displayName: values.name, roles,
    categoryAuthorisations, passwordHash: await hashPassword(password),
  });
  // NFR-1.4 — the account's creation is an authentication event. The operator is
  // not an application user, so the event is unattributed; the account is the object.
  await auditRepository.recordSecurityEvent({
    origin: 'auth', eventType: 'auth.account.created', outcome: 'success', occurredAt: new Date(),
    actorSource: 'unattributed', campusId, collectionName: 'users', documentId: user._id,
  });
  console.log(`Created user ${user._id} (${roles.join(', ')}).`);
} catch (error) {
  // A duplicate email (FR-1.1 unique index) or a schema refusal lands here.
  console.error(`Not created: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}

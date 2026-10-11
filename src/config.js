/**
 * Runtime configuration. Traces to: NFR-3.5, DEC-003, DEC-018.
 *
 * Configuration comes from the process environment only. On the VPS that is the
 * systemd `EnvironmentFile` (DEC-003). In development it is
 * `node --env-file=.env`, which is built into Node 22, so this module never
 * names a file and the repository holds no secret (NFR-3.5).
 *
 * The application refuses to start on a missing or malformed value rather than
 * falling back to a default. A process that starts with the wrong database is
 * worse than one that does not start.
 *
 * Error messages name the variable, never its value: MONGODB_URI carries a
 * credential, and a startup error ends up in the journal.
 */

export class ConfigurationError extends Error {}

export function loadConfig(env = process.env) {
  const problems = [];

  const mongodbUri = env.MONGODB_URI;
  if (!mongodbUri) problems.push('MONGODB_URI is not set');
  else if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    problems.push('MONGODB_URI is not a mongodb:// or mongodb+srv:// connection string');
  }

  const portText = env.PORT;
  const port = Number(portText);
  if (!portText) problems.push('PORT is not set');
  else if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT is not an integer between 1 and 65535');
  }

  if (problems.length > 0) {
    throw new ConfigurationError(`Invalid configuration: ${problems.join('; ')}`);
  }

  return Object.freeze({ mongodbUri, port });
}

/**
 * DEC-003: Node listens on the loopback interface only, behind Nginx. Not
 * configurable, so a misread environment file cannot expose the process.
 */
export const LISTEN_HOST = '127.0.0.1';

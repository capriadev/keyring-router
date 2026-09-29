import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The `.env` file of the repository root, read by the command that starts the gateway. The backend never
 * reads a file: it receives its boot configuration in the environment, so this is the one place that turns
 * the file a user edits into the variables a process sees.
 *
 * Format: `KEY=VALUE`, one per line. A line starting with `#` is a comment, an empty line is skipped, and
 * a value may be wrapped in single or double quotes. Nothing is expanded: a value is taken literally.
 */
export function readEnvFile(repoRoot: string): Record<string, string> {
  const path = join(repoRoot, '.env');

  if (!existsSync(path)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const name = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    const quoted =
      raw.length >= 2 && (raw.startsWith('"') || raw.startsWith("'")) && raw.endsWith(raw[0]);

    values[name] = quoted ? raw.slice(1, -1) : raw;
  }

  return values;
}

/**
 * The environment a gateway child process gets: what the file declares, over the inherited environment, so
 * a value exported in the shell still wins when a user is debugging, and the file wins when it is not set.
 */
export function gatewayEnvironment(
  repoRoot: string,
  overrides: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[name] = value;
    }
  }

  for (const [name, value] of Object.entries(readEnvFile(repoRoot))) {
    environment[name] = value;
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      environment[name] = value;
    }
  }

  return environment;
}

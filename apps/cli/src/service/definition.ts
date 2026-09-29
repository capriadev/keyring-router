import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { backendEntry } from '../paths.js';

/**
 * The definition of the Windows service, built as data so it can be checked without touching the system.
 * The service runs the built backend, from the repository root, with the environment `.env` declares: the
 * same entry point `kr serve` runs, so there is no second launcher to keep in sync.
 */

export const SERVICE_NAME = 'Keyring Router';
export const SERVICE_ID = 'keyring-router';

export interface ServiceDefinitionInput {
  readonly root: string;
  readonly nodePath: string;
  readonly environment: Readonly<Record<string, string>>;
  /** Overrides of the watched variables, from the command flags. */
  readonly port?: string;
  readonly dbPath?: string;
}

export interface ServiceDefinition {
  readonly name: string;
  readonly description: string;
  readonly script: string;
  readonly workingDirectory: string;
  readonly env: readonly { readonly name: string; readonly value: string }[];
  readonly logDirectory: string;
  readonly waitSeconds: number;
  readonly grow: number;
  readonly maxRestarts: number;
}

/**
 * The variables the service is given. They are passed explicitly rather than inherited: a service starts
 * with the machine, long before any shell profile exists, so the file is the only source it can trust.
 */
/** The variables the gateway boots with. Anything else belongs to the user's shell, not to the service. */
const WATCHED_VARIABLES = ['KR_HOST', 'KR_PORT', 'KR_DB_PATH', 'KR_SECRET_PEPPER'] as const;

/**
 * The variables the service is given. They are passed explicitly rather than inherited: a service starts
 * with the machine, long before any shell profile exists, so the file is the only source it can trust.
 * A flag replaces the value of the file with the same name, so the service never receives it twice.
 */
export function serviceEnvironment(input: ServiceDefinitionInput): readonly {
  readonly name: string;
  readonly value: string;
}[] {
  const byName = new Map<string, string>();

  for (const name of WATCHED_VARIABLES) {
    const value = input.environment[name];

    if (value !== undefined && value !== '') {
      byName.set(name, value);
    }
  }

  if (input.port !== undefined) {
    byName.set('KR_PORT', input.port);
  }

  if (input.dbPath !== undefined) {
    byName.set('KR_DB_PATH', input.dbPath);
  }

  return [...byName].map(([name, value]) => ({ name, value }));
}

export function buildServiceDefinition(input: ServiceDefinitionInput): ServiceDefinition {
  return {
    name: SERVICE_NAME,
    description: 'Keyring Router: local gateway for AI inference providers.',
    script: backendEntry(input.root),
    workingDirectory: input.root,
    env: serviceEnvironment(input),
    logDirectory: join(input.root, 'logs', 'gateway'),
    // A crash is retried after 5 seconds, doubling up to a minute, and the wrapper gives up after enough
    // attempts: a gateway that cannot start should stay down and be visible instead of looping forever.
    waitSeconds: 5,
    grow: 2,
    maxRestarts: 10,
  };
}

/** The one check worth failing the install on: a service that cannot find its entry point never boots. */
export function missingEntryPoint(definition: ServiceDefinition): string | null {
  return existsSync(definition.script)
    ? null
    : `the backend is not built: run npm run build:backend first (expected ${definition.script})`;
}
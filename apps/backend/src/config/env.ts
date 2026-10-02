import { resolve } from 'node:path';
import { z } from 'zod';
import type { RoutingMode } from '../types/routing.js';
import { REPO_ROOT } from './paths.js';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4310;
export const DEFAULT_DB_PATH = 'apps/backend/data/kr.db';

/** The default routing mode: it behaves like any API, so an installation is unchanged until it opts in. */
export const DEFAULT_ROUTING_MODE: RoutingMode = 'normal';

/** Boot configuration. The credential pepper lives beside it, in `secrets.env.ts`. */
export interface AppEnv {
  readonly host: string;
  readonly port: number;
  /** Absolute path. A relative `KR_DB_PATH` is resolved against the repository root. */
  readonly dbPath: string;
  /**
   * How a chat request may be served and the fallbacks it may walk. Both live here until feature 21
   * gives them a home per entry point; the default mode is `normal`, so nothing changes by default.
   */
  readonly routingMode: RoutingMode;
  readonly routingCascade: readonly string[];
}

export const APP_ENV = Symbol('APP_ENV');

const envSchema = z.object({
  KR_HOST: z.string().min(1).default(DEFAULT_HOST),
  KR_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  KR_DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
  KR_ROUTING_MODE: z.enum(['normal', 'auto_model', 'auto_general']).default(DEFAULT_ROUTING_MODE),
  /** Ordered provider model ids, comma separated. Matched exactly, never split on a slash. */
  KR_ROUTING_CASCADE: z.string().default(''),
});

/** A comma separated list of provider model ids, trimmed and without empties. */
function parseCascade(value: string): readonly string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid environment configuration (${detail})`);
  }

  return {
    host: parsed.data.KR_HOST,
    port: parsed.data.KR_PORT,
    dbPath: resolve(REPO_ROOT, parsed.data.KR_DB_PATH),
    routingMode: parsed.data.KR_ROUTING_MODE,
    routingCascade: parseCascade(parsed.data.KR_ROUTING_CASCADE),
  };
}

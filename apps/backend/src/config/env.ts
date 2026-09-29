import { resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from './paths.js';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4310;
export const DEFAULT_DB_PATH = 'apps/backend/data/kr.db';

/** Boot configuration. This slice stores no secret in the environment. */
export interface AppEnv {
  readonly host: string;
  readonly port: number;
  /** Absolute path. A relative `KR_DB_PATH` is resolved against the repository root. */
  readonly dbPath: string;
}

export const APP_ENV = Symbol('APP_ENV');

const envSchema = z.object({
  KR_HOST: z.string().min(1).default(DEFAULT_HOST),
  KR_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  KR_DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
});

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
  };
}

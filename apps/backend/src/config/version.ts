import { createRequire } from 'node:module';
import { z } from 'zod';

const require = createRequire(import.meta.url);

const packageJsonSchema = z.object({ version: z.string().min(1) });

/** Reported by `/api/health`. Read from the backend manifest so the version has one source. */
export function readBackendVersion(): string {
  const parsed = packageJsonSchema.safeParse(require('../../package.json'));

  if (!parsed.success) {
    throw new Error('the backend package manifest has no version');
  }

  return parsed.data.version;
}

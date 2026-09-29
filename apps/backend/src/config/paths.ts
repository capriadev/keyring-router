import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Layout anchors derived from this file's own URL. `src/config/` and the compiled `dist/config/`
 * sit at the same depth, so both the tsx runtime and the built output resolve the same roots
 * regardless of the process working directory.
 */
const configDir = fileURLToPath(new URL('.', import.meta.url));

export const BACKEND_ROOT = join(configDir, '..', '..');

export const REPO_ROOT = join(configDir, '..', '..', '..', '..');

export const MIGRATIONS_DIR = join(BACKEND_ROOT, 'drizzle');

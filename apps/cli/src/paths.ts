import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where things are, relative to this workspace. `apps/cli/src/paths.ts` and `apps/cli/dist/paths.js` sit at
 * the same depth, so a command run from source and a command run from the build resolve the same root: the
 * one rule that keeps `kr` working the same way before and after `npm run build`.
 */

function workspaceDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** The repository root: three levels above this file (`paths.ts` -> cli -> apps -> root). */
export function repoRoot(): string {
  return resolve(join(workspaceDir(), '..', '..', '..'));
}

/** The built backend, the process a foreground run and the Windows service both start. */
export function backendEntry(root: string = repoRoot()): string {
  return join(root, 'apps', 'backend', 'dist', 'main.js');
}

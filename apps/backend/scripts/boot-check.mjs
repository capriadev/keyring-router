/**
 * Boots the compiled gateway the way a user does (`node dist/main.js`) and fails if it does not answer.
 *
 * The unit and end to end suites run the source through tsx, which emits decorator metadata differently
 * from tsc. A provider Nest cannot resolve, such as one with a constructor parameter that is neither
 * injected nor a provider, only breaks the compiled build; nothing else in the repository runs that
 * build, so this is the check that does. Run it after `npm run build:backend`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = String(process.env.KR_BOOT_CHECK_PORT ?? '4399');
const directory = mkdtempSync(join(tmpdir(), 'kr-boot-'));
const dbPath = join(directory, 'boot.db');
const env = { ...process.env, KR_HOST: '127.0.0.1', KR_PORT: port, KR_DB_PATH: dbPath };

/** The compiled gateway reads the schema at boot, so the throwaway database is migrated first. */
const migrate = spawnSync(process.execPath, [join(backendRoot, 'dist', 'dal', 'migrate.cli.js')], {
  cwd: backendRoot,
  env,
  encoding: 'utf8',
});

if (migrate.status !== 0) {
  console.error(`the migrate step failed:\n${migrate.stdout}\n${migrate.stderr}`);
  rmSync(directory, { recursive: true, force: true });
  process.exit(1);
}

const child = spawn(process.execPath, [join(backendRoot, 'dist', 'main.js')], {
  cwd: backendRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => (output += chunk.toString()));
child.stderr.on('data', (chunk) => (output += chunk.toString()));

async function waitForHealth() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the compiled gateway exited with code ${child.exitCode}\n${output}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet: keep waiting until the deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`the compiled gateway did not answer on http://127.0.0.1:${port}/api/health within 20s\n${output}`);
}

try {
  await waitForHealth();
  console.log(`ok: the compiled gateway answered on http://127.0.0.1:${port}/api/health`);
  child.kill();
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  child.kill();
  process.exitCode = 1;
} finally {
  setTimeout(() => rmSync(directory, { recursive: true, force: true }), 1000);
}

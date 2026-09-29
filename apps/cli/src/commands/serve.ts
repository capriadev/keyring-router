import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EXIT, type CommandContext } from '../client.js';
import { parseFlags, stringFlag } from '../args.js';
import { gatewayEnvironment } from '../env-file.js';
import { info } from '../output.js';
import { backendEntry, repoRoot } from '../paths.js';

/**
 * `kr serve`: the gateway in the foreground. It runs the same entry point the Windows service runs, so
 * there is no second launcher to keep in sync, and the child owns its own shutdown hooks: a Ctrl+C reaches
 * the gateway, not this command line.
 */
export async function serveCommand(context: CommandContext): Promise<number> {
  const parsed = parseFlags(context.argv, {
    port: { type: 'string', description: 'port to listen on, overriding KR_PORT' },
    db: { type: 'string', description: 'database file, overriding KR_DB_PATH' },
  });
  const entry = backendEntry();

  if (!existsSync(entry)) {
    throw new Error(`the backend is not built: run npm run build:backend first (expected ${entry})`);
  }

  const port = stringFlag(parsed, 'port');
  const db = stringFlag(parsed, 'db');
  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    // The `.env` of the repository root is what makes the boot configuration real for a command a user
    // runs, and the flags win over it: a debug run must not have to edit a file.
    env: gatewayEnvironment(repoRoot(), {
      ...(port === undefined ? {} : { KR_PORT: port }),
      ...(db === undefined ? {} : { KR_DB_PATH: db }),
    }),
  });

  info(`gateway starting (${entry})`);

  const code = await new Promise<number>((resolveCode) => {
    child.once('exit', (exitCode: number | null, signal: string | null) => {
      resolveCode(signal === null ? (exitCode ?? 0) : EXIT.usage);
    });
  });

  return code;
}

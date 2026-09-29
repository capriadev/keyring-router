import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, apiBaseUrl, request, type CommandContext } from '../client.js';
import { parseFlags } from '../args.js';
import { info } from '../output.js';

/**
 * `kr doctor`: the checks a user needs before blaming the gateway. Each one answers yes or no with the
 * command that fixes it, and nothing here reads a secret: the pepper is only checked for presence.
 */

const PEPPER = 'KR_SECRET_PEPPER';

/** The repository root, from either `src/` or `dist/`: the command line lives one level below `apps/`. */
function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));

  return resolve(join(here, '..', '..', '..', '..'));
}

function envFileValue(name: string): string | undefined {
  const path = join(repoRoot(), '.env');

  if (!existsSync(path)) {
    return undefined;
  }

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);

    if (match?.[1] === name) {
      return match[2]?.trim();
    }
  }

  return undefined;
}

function pepperIsConfigured(): boolean {
  const fromEnv = process.env[PEPPER]?.trim();

  return fromEnv !== undefined && fromEnv !== '' ? true : (envFileValue(PEPPER) ?? '') !== '';
}

function nodeMatchesNvmrc(): { ok: boolean; detail: string } {
  const path = join(repoRoot(), '.nvmrc');

  if (!existsSync(path)) {
    return { ok: true, detail: 'no .nvmrc to compare against' };
  }

  const expected = readFileSync(path, 'utf8').trim();
  const running = process.versions.node;
  const sameMajor = expected.split('.')[0] === running.split('.')[0];

  return {
    ok: sameMajor,
    detail: `node ${running}, .nvmrc wants ${expected}`,
  };
}

function databasePath(): string {
  const configured = process.env.KR_DB_PATH?.trim();

  return configured === undefined || configured === ''
    ? join(repoRoot(), 'apps', 'backend', 'data', 'kr.db')
    : resolve(repoRoot(), configured);
}

export async function doctorCommand(context: CommandContext): Promise<number> {
  parseFlags(context.argv, {});

  const node = nodeMatchesNvmrc();
  const database = databasePath();
  const databaseExists = existsSync(database);
  const pepper = pepperIsConfigured();
  let gateway: string;

  try {
    const health = (await request('GET', '/api/health')).body as { status: string; version: string };

    gateway = `answering at ${apiBaseUrl()} (version ${health.version})`;
  } catch {
    gateway = `not answering at ${apiBaseUrl()}: start it with kr serve`;
  }

  const lines = [
    `node        ${node.ok ? 'ok' : 'mismatch'}: ${node.detail}`,
    `pepper      ${pepper ? 'present' : `missing: generate one and put it in .env, a credential with a secret cannot be read without it`}`,
    `database    ${databaseExists ? `present: ${database}` : `missing: it is created by npm run db:migrate --workspace apps/backend`}`,
    `gateway     ${gateway}`,
  ];

  info(lines.join('\n'));

  return node.ok && pepper ? EXIT.ok : EXIT.usage;
}

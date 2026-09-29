import { EXIT, request, type CommandContext } from '../client.js';
import { parseFlags, requiredPositional, stringFlag } from '../args.js';
import { info, printJson, printRows, promptSecret } from '../output.js';

interface Credential {
  readonly id: string;
  readonly namespace: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly authKind: string;
  readonly secretHint: string | null;
  readonly lastValidatedAt: number | null;
  readonly lastRefreshError: string | null;
}

const AUTH_KINDS = ['none', 'api_key'] as const;

async function listCredentials(): Promise<readonly Credential[]> {
  return (await request('GET', '/api/credentials')).body as readonly Credential[];
}

async function credentialByNamespace(namespace: string): Promise<Credential> {
  const credentials = await listCredentials();
  const found = credentials.find((credential) => credential.namespace === namespace);

  if (found === undefined) {
    // The message names what exists, so a typo is fixed in one step.
    throw new Error(
      `no credential uses the namespace ${namespace}${credentials.length === 0 ? ' (none is configured yet)' : `; configured: ${credentials.map((entry) => entry.namespace).join(', ')}`}`,
    );
  }

  return found;
}

/**
 * `kr credential`: everything a credential needs, except creating one from a secret written on the command
 * line. The secret is prompted without echo, or read from stdin, so it never lands in the shell history.
 */
export async function credentialCommand(context: CommandContext): Promise<number> {
  const [subcommand, ...rest] = context.argv;

  switch (subcommand) {
    case 'list':
      return await listCommand(rest, context);
    case 'add':
      return await addCommand(rest, context);
    case 'validate':
      return await validateCommand(rest);
    case 'refresh':
      return await refreshCommand(rest);
    case 'rotate':
      return await rotateCommand(rest);
    default:
      throw new Error(
        'usage: kr credential <list|add|validate|refresh|rotate> (see kr --help for the flags of each one)',
      );
  }
}

async function listCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const parsed = parseFlags(argv, { json: { type: 'boolean', description: 'machine readable output' } });
  const credentials = await listCredentials();

  if (context.json || parsed.values.json === true) {
    printJson(credentials);

    return EXIT.ok;
  }

  printRows(
    ['namespace', 'provider', 'auth', 'hint', 'last refresh'],
    credentials.map((credential) => [
      credential.namespace,
      credential.providerId,
      credential.authKind,
      credential.secretHint ?? '-',
      credential.lastRefreshError === null ? 'ok' : 'failed',
    ]),
  );

  return EXIT.ok;
}

async function addCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const parsed = parseFlags(argv, {
    namespace: { type: 'string', description: 'unique name of this credential, used as the model namespace' },
    provider: { type: 'string', description: 'provider id from the catalog, see kr providers' },
    'base-url': { type: 'string', description: 'endpoint of the provider for this credential' },
    auth: { type: 'string', description: 'none, or api_key when the provider needs a secret' },
    json: { type: 'boolean', description: 'machine readable output' },
  });

  const namespace = stringFlag(parsed, 'namespace') ?? requiredPositional(parsed, 'namespace');
  const providerId = stringFlag(parsed, 'provider') ?? requiredPositional(parsed, 'provider');
  const baseUrl = stringFlag(parsed, 'base-url');
  const authKind = stringFlag(parsed, 'auth') ?? 'none';

  if (baseUrl === undefined) {
    throw new Error('usage: kr credential add --namespace <name> --provider <id> --base-url <url> [--auth none|api_key]');
  }

  if (!AUTH_KINDS.includes(authKind as (typeof AUTH_KINDS)[number])) {
    throw new Error(`--auth must be one of ${AUTH_KINDS.join(', ')}`);
  }

  const secret = authKind === 'api_key' ? await promptSecret(`secret for ${namespace}: `) : undefined;
  const created = await request('POST', '/api/credentials', {
    namespace,
    providerId,
    baseUrl,
    authKind,
    ...(secret === undefined ? {} : { secret }),
  });

  if (context.json) {
    printJson(created.body);

    return EXIT.ok;
  }

  info(`credential ${namespace} created for ${providerId}`);

  return EXIT.ok;
}

async function validateCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {});
  const credential = await credentialByNamespace(requiredPositional(parsed, 'namespace'));
  const result = (await request('POST', `/api/credentials/${credential.id}/validate`)).body as {
    ok: boolean;
    detail: string;
  };

  info(result.detail);

  return EXIT.ok;
}

async function refreshCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, { json: { type: 'boolean', description: 'machine readable output' } });
  const credential = await credentialByNamespace(requiredPositional(parsed, 'namespace'));
  const result = (
    await request('POST', `/api/credentials/${credential.id}/refresh`)
  ).body as { discovered: number; exposed: number };

  info(`${result.discovered} discovered, ${result.exposed} exposed by policy`);

  return EXIT.ok;
}

async function rotateCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {});
  const credential = await credentialByNamespace(requiredPositional(parsed, 'namespace'));

  if (credential.authKind === 'none') {
    throw new Error(`${credential.namespace} stores no secret: rotate a credential that has one`);
  }

  const secret = await promptSecret(`new secret for ${credential.namespace}: `);
  await request('PATCH', `/api/credentials/${credential.id}/secret`, { secret });

  info(`secret rotated for ${credential.namespace}`);

  return EXIT.ok;
}

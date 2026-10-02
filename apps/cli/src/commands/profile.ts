import type { RoutingProfile } from '@keyring-router/contracts';
import { EXIT, request, type CommandContext } from '../client.js';
import { parseFlags, requiredPositional, stringFlag } from '../args.js';
import { info, printJson, printRows } from '../output.js';

/**
 * `kr profile`: the mode and the cascade that apply to each model. A profile is keyed by the model, so
 * it is shared by every name that asks for it, and a model with no profile behaves as the default.
 */
export async function profileCommand(context: CommandContext): Promise<number> {
  const [subcommand, ...rest] = context.argv;

  switch (subcommand) {
    case 'list':
      return await listCommand(rest, context);
    case 'add':
      return await addCommand(rest);
    case 'remove':
      return await removeCommand(rest);
    default:
      throw new Error('usage: kr profile <list|add|remove> (see kr --help for the flags of each one)');
  }
}

/** The cascade flag: an ordered list of model ids, comma separated. An entry is never split on a slash. */
function parseCascade(value: string | undefined): readonly string[] {
  return value === undefined
    ? []
    : value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

async function listCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const parsed = parseFlags(argv, { json: { type: 'boolean', description: 'machine readable output' } });
  const profiles = (await request('GET', '/api/routing/profiles')).body as readonly RoutingProfile[];

  if (context.json || parsed.values.json === true) {
    printJson(profiles);

    return EXIT.ok;
  }

  printRows(
    ['model', 'mode', 'cascade', 'id'],
    profiles.map((profile) => [
      profile.providerModelId,
      profile.mode,
      profile.cascade.length === 0 ? '(none)' : profile.cascade.join(' > '),
      profile.id,
    ]),
  );

  return EXIT.ok;
}

async function addCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {
    mode: { type: 'string', description: 'normal, auto_model or auto_general' },
    cascade: { type: 'string', description: 'ordered model ids, comma separated' },
  });
  const model = requiredPositional(parsed, 'model');
  const mode = stringFlag(parsed, 'mode') ?? 'normal';
  const cascade = parseCascade(stringFlag(parsed, 'cascade'));

  const created = await request('POST', '/api/routing/profiles', { providerModelId: model, mode, cascade });
  const profile = created.body as RoutingProfile;

  info(
    `profile for ${profile.providerModelId}: ${profile.mode}` +
      (profile.cascade.length === 0 ? '' : ` > ${profile.cascade.join(' > ')}`),
  );

  return EXIT.ok;
}

async function removeCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {});
  const id = requiredPositional(parsed, 'profile id');
  await request('DELETE', `/api/routing/profiles/${id}`);

  info(`profile ${id} removed`);

  return EXIT.ok;
}
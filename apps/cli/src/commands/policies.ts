import type { Credential, PolicyRule } from '@keyring-router/contracts';
import { EXIT, request, type CommandContext } from '../client.js';
import { parseFlags, requiredPositional, stringFlag } from '../args.js';
import { info, printJson, printRows } from '../output.js';

/**
 * `kr policy`: the rules that decide which discovered models are exposed. A pattern matches the namespaced
 * model id, `--namespace` scopes a rule to one credential, and deny always wins over allow.
 */
export async function policyCommand(context: CommandContext): Promise<number> {
  const [subcommand, ...rest] = context.argv;

  switch (subcommand) {
    case 'list':
      return await listCommand(rest, context);
    case 'allow':
      return await createCommand('allow', rest);
    case 'deny':
      return await createCommand('deny', rest);
    case 'remove':
      return await removeCommand(rest);
    default:
      throw new Error('usage: kr policy <list|allow|deny|remove> (see kr --help for the flags of each one)');
  }
}

async function listCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const parsed = parseFlags(argv, { json: { type: 'boolean', description: 'machine readable output' } });
  const rules = (await request('GET', '/api/policies')).body as readonly PolicyRule[];
  const credentials = (await request('GET', '/api/credentials')).body as readonly Credential[];

  if (context.json || parsed.values.json === true) {
    printJson(rules);

    return EXIT.ok;
  }

  const namespaces = new Map(credentials.map((credential) => [credential.id, credential.namespace]));

  printRows(
    ['effect', 'pattern', 'scope', 'id'],
    rules.map((rule) => [
      rule.effect,
      rule.pattern,
      rule.credentialId === null ? 'every credential' : (namespaces.get(rule.credentialId) ?? 'unknown'),
      rule.id,
    ]),
  );

  return EXIT.ok;
}

async function createCommand(effect: 'allow' | 'deny', argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {
    namespace: { type: 'string', description: 'scope the rule to one credential' },
  });
  const pattern = requiredPositional(parsed, 'pattern');
  const namespace = stringFlag(parsed, 'namespace');
  let credentialId: string | null = null;

  if (namespace !== undefined) {
    const credentials = (await request('GET', '/api/credentials')).body as readonly Credential[];
    const found = credentials.find((credential) => credential.namespace === namespace);

    if (found === undefined) {
      throw new Error(`no credential uses the namespace ${namespace}`);
    }

    credentialId = found.id;
  }

  const created = await request('POST', '/api/policies', { pattern, effect, credentialId });

  info(`${effect} rule created for ${pattern}`);

  return contextJsonFree(created.body);
}

async function removeCommand(argv: readonly string[]): Promise<number> {
  const parsed = parseFlags(argv, {});
  const id = requiredPositional(parsed, 'rule id');
  await request('DELETE', `/api/policies/${id}`);

  info(`rule ${id} removed`);

  return EXIT.ok;
}

function contextJsonFree(_body: unknown): number {
  return EXIT.ok;
}

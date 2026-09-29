import { EXIT, request, type CommandContext } from '../client.js';
import { booleanFlag, parseFlags } from '../args.js';
import { info, printJson, printRows } from '../output.js';

interface ExposedModel {
  readonly namespacedId: string;
  readonly providerId: string;
  readonly displayName: string;
}

interface CatalogModel {
  readonly namespacedId: string;
  readonly providerId: string;
  readonly exposed: boolean;
}

/**
 * `kr models`: the models a client may call. `--catalog` shows the discovered catalog with its exposure
 * flag instead, which is the difference the product is built on: a catalog is not a policy.
 */
export async function modelsCommand(context: CommandContext): Promise<number> {
  const parsed = parseFlags(context.argv, {
    catalog: { type: 'boolean', description: 'show the discovered catalog and whether each model is exposed' },
    json: { type: 'boolean', description: 'machine readable output' },
  });
  const catalog = booleanFlag(parsed, 'catalog');
  const result = await request('GET', catalog ? '/api/catalog' : '/api/models');

  if (booleanFlag(parsed, 'json') || context.json) {
    printJson(result.body);

    return EXIT.ok;
  }

  if (catalog) {
    printRows(
      ['model', 'provider', 'exposed'],
      (result.body as readonly CatalogModel[]).map((model) => [
        model.namespacedId,
        model.providerId,
        model.exposed ? 'yes' : 'no',
      ]),
    );

    return EXIT.ok;
  }

  printRows(
    ['model', 'provider', 'name'],
    (result.body as readonly ExposedModel[]).map((model) => [
      model.namespacedId,
      model.providerId,
      model.displayName,
    ]),
  );

  return EXIT.ok;
}

/** `kr providers`: what the catalog offers and how a credential authenticates against each one. */
export async function providersCommand(context: CommandContext): Promise<number> {
  const parsed = parseFlags(context.argv, {
    json: { type: 'boolean', description: 'machine readable output' },
  });
  const result = await request('GET', '/api/providers');

  if (booleanFlag(parsed, 'json') || context.json) {
    printJson(result.body);

    return EXIT.ok;
  }

  interface ProviderRow {
    readonly providerId: string;
    readonly displayName: string;
    readonly format: string;
    readonly authType: string;
    readonly modelCount: number;
  }

  printRows(
    ['id', 'name', 'format', 'auth', 'models'],
    (result.body as readonly ProviderRow[]).map((provider) => [
      provider.providerId,
      provider.displayName,
      provider.format,
      provider.authType,
      String(provider.modelCount),
    ]),
  );

  return EXIT.ok;
}

export function describeCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export { info };

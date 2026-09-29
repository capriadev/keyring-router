import type { ChatRequest, TranslateRequestOptions } from '../../types/chat.js';

/**
 * Where one parameter travels inside a provider body: the path the value must be written to, or `null` when
 * the body carries that name verbatim at its top level. The catalog declares `unsupportedParams` with these
 * names, so removal walks the same route as placement: a name that is nested for one protocol is removed
 * from its nested place, not from a top level key that would never exist.
 */
export type ParameterPlacement = (name: string) => readonly string[] | null;

/**
 * The parameter names a normalized request and the catalog defaults use, next to the provider spellings the
 * catalog declares. A name outside every table keeps the provider's own spelling.
 */
const TOP_LEVEL_PATHS: Readonly<Record<string, readonly string[]>> = {
  topP: ['top_p'],
  topK: ['top_k'],
  maxTokens: ['max_tokens'],
  maxOutputTokens: ['max_tokens'],
};

const GEMINI_PATHS: Readonly<Record<string, readonly string[]>> = {
  temperature: ['generationConfig', 'temperature'],
  topP: ['generationConfig', 'topP'],
  top_p: ['generationConfig', 'topP'],
  topK: ['generationConfig', 'topK'],
  top_k: ['generationConfig', 'topK'],
  maxTokens: ['generationConfig', 'maxOutputTokens'],
  maxOutputTokens: ['generationConfig', 'maxOutputTokens'],
  max_tokens: ['generationConfig', 'maxOutputTokens'],
  stop: ['generationConfig', 'stopSequences'],
  stop_sequences: ['generationConfig', 'stopSequences'],
  seed: ['generationConfig', 'seed'],
  frequency_penalty: ['generationConfig', 'frequencyPenalty'],
  presence_penalty: ['generationConfig', 'presencePenalty'],
};

/** OpenAI and Claude carry every generation parameter at the top level, with two camelCase aliases. */
export const topLevelPlacement: ParameterPlacement = (name) => TOP_LEVEL_PATHS[name] ?? null;

/** Gemini nests the generation parameters inside `generationConfig` and renames several of them. */
export const geminiPlacement: ParameterPlacement = (name) => GEMINI_PATHS[name] ?? null;

/**
 * Merges the catalog defaults, the client passthrough and the modeled parameters into the provider body, then
 * removes every parameter the catalog declares unsupported and reports each removal.
 *
 * Order is intent: a catalog default fills what the client left open, and an explicit client value wins over
 * it, whether it arrived modeled or as passthrough. The body is the third argument's own object, and the
 * returned warnings are the ones the facade publishes as `kr_warnings`.
 */
export function placeParameters(
  body: Record<string, unknown>,
  placement: ParameterPlacement,
  request: ChatRequest,
  options: TranslateRequestOptions,
): readonly string[] {
  for (const [name, value] of Object.entries(options.requestDefaults ?? {})) {
    writeAt(body, pathOf(placement, name), value);
  }

  for (const [name, value] of Object.entries(request.passthrough ?? {})) {
    writeAt(body, pathOf(placement, name), value);
  }

  writePresent(body, placement, 'temperature', request.temperature);
  writePresent(body, placement, 'topP', request.topP);
  writePresent(body, placement, 'maxOutputTokens', request.maxOutputTokens);

  return removeUnsupported(body, placement, options.unsupportedParams);
}

function pathOf(placement: ParameterPlacement, name: string): readonly string[] {
  return placement(name) ?? [name];
}

function writePresent(
  body: Record<string, unknown>,
  placement: ParameterPlacement,
  name: string,
  value: unknown,
): void {
  if (value !== undefined) {
    writeAt(body, pathOf(placement, name), value);
  }
}

function writeAt(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const [head, ...rest] = path;

  if (head === undefined || head === '') {
    return;
  }

  if (rest.length === 0) {
    target[head] = value;

    return;
  }

  const nested = target[head];

  if (isMutableRecord(nested)) {
    writeAt(nested, rest, value);

    return;
  }

  const created: Record<string, unknown> = {};
  writeAt(created, rest, value);
  target[head] = created;
}

/**
 * Removes the parameters the catalog declares unsupported, once each, and names only the ones that were
 * actually there: a warning says something was taken away from the client, so it is never emitted for a
 * parameter that was absent to begin with.
 */
function removeUnsupported(
  body: Record<string, unknown>,
  placement: ParameterPlacement,
  unsupported: readonly string[],
): readonly string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const name of unsupported) {
    if (name === '' || seen.has(name)) {
      continue;
    }

    seen.add(name);

    if (removeAt(body, pathOf(placement, name), true)) {
      warnings.push(
        `parameter ${name} is declared unsupported for this model and was removed from the request body`,
      );
    }
  }

  return warnings;
}

/** Removes one value; `prune` drops the parent objects a removal leaves empty. */
function removeAt(target: Record<string, unknown>, path: readonly string[], prune: boolean): boolean {
  const [head, ...rest] = path;

  if (head === undefined || !(head in target)) {
    return false;
  }

  if (rest.length === 0) {
    delete target[head];

    return true;
  }

  const nested = target[head];

  if (!isMutableRecord(nested) || !removeAt(nested, rest, prune)) {
    return false;
  }

  if (prune && Object.keys(nested).length === 0) {
    delete target[head];
  }

  return true;
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

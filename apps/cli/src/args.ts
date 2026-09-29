import { parseArgs } from 'node:util';
import { CliError, EXIT } from './client.js';

export interface FlagSpec {
  readonly type: 'string' | 'boolean';
  readonly short?: string;
  readonly multiple?: boolean;
  readonly description: string;
}

export type FlagSpecs = Readonly<Record<string, FlagSpec>>;

export interface ParsedFlags {
  readonly values: Record<string, string | boolean | (string | boolean)[] | undefined>;
  readonly positionals: readonly string[];
}

/**
 * The flags of one command, parsed by the standard library. An unknown flag is a usage error rather than
 * something quietly ignored, because a typo that silently does nothing is worse than a refusal.
 */
export function parseFlags(argv: readonly string[], specs: FlagSpecs): ParsedFlags {
  try {
    const parsed = parseArgs({ args: [...argv], options: specs, allowPositionals: true, strict: true });

    return { values: parsed.values, positionals: parsed.positionals };
  } catch (error) {
    throw new CliError('usage', error instanceof Error ? error.message : 'invalid arguments', EXIT.usage);
  }
}

export function stringFlag(parsed: ParsedFlags, name: string): string | undefined {
  const value = parsed.values[name];

  return typeof value === 'string' ? value : undefined;
}

export function booleanFlag(parsed: ParsedFlags, name: string): boolean {
  return parsed.values[name] === true;
}

/** The one positional a command takes, or a usage error that says what was expected. */
export function requiredPositional(parsed: ParsedFlags, expected: string): string {
  const [first, ...rest] = parsed.positionals;

  if (first === undefined || rest.length > 0) {
    throw new CliError('usage', `expected exactly one ${expected}`, EXIT.usage);
  }

  return first;
}

export function noPositionals(parsed: ParsedFlags): void {
  if (parsed.positionals.length > 0) {
    throw new CliError('usage', `unexpected argument: ${parsed.positionals[0]}`, EXIT.usage);
  }
}

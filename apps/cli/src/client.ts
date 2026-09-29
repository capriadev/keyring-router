/**
 * The HTTP client of the command line and the exit codes every command shares.
 *
 * A management command never reimplements a rule: it calls the gateway's own API, so the terminal and the
 * local interface answer the same thing. Only `serve` and `doctor` step outside this module.
 */
export const EXIT = {
  ok: 0,
  /** The command was called wrong: an unknown flag, a missing argument. */
  usage: 1,
  /** Nothing is listening where the gateway should be. */
  unreachable: 2,
  /** The gateway answered, and it refused the command. */
  rejected: 3,
} as const;

export interface CommandContext {
  readonly argv: readonly string[];
  readonly json: boolean;
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

/** The address of the gateway. `KR_API_URL` exists for an installation on another port. */
export function apiBaseUrl(): string {
  return process.env.KR_API_URL ?? 'http://127.0.0.1:4310';
}

export interface ApiResult {
  readonly status: number;
  readonly body: unknown;
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error?: { message?: unknown; code?: unknown } }).error;
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';

    if (typeof error?.message === 'string') {
      return `${error.message}${code}`;
    }
  }

  return `the gateway answered with status ${status}`;
}

/** One call to the local API. A refusal becomes an error the terminal prints and the exit code reflects. */
export async function request(method: string, path: string, payload?: unknown): Promise<ApiResult> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: payload === undefined ? {} : { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new CliError(
      'unreachable',
      `the gateway is not answering at ${apiBaseUrl()}: start it with kr serve`,
      EXIT.unreachable,
    );
  }

  const text = await response.text();
  let body: unknown = null;

  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new CliError('rejected', errorMessage(body, response.status), EXIT.rejected);
  }

  return { status: response.status, body };
}

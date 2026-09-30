export interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

const requests: CapturedRequest[] = [];
const realFetch = globalThis.fetch;

/** Replaces the global fetch for one test and records what the client sent. */
export function stubFetch(respond: () => Response | Promise<Response>): void {
  requests.length = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });

    return await respond();
  }) as typeof fetch;
}

/** What the client would have sent in the current test, in order. */
export function sentRequests(): readonly CapturedRequest[] {
  return requests;
}

export function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Call in `afterEach`: the HTTP client is the only module that reaches the network. */
export function restoreFetch(): void {
  globalThis.fetch = realFetch;
}
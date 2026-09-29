import type { ProviderErrorKind, ProviderFailure } from '../../types/provider.js';

/** Builds the secret free failure the calling adapter reports, in its own voice. */
export type FrameFailure = (kind: ProviderErrorKind, message: string) => ProviderFailure;

export interface ReadSseFramesInput {
  readonly label: string;
  /** The operation as a failure names it, without the host: a host can embed a credential. */
  readonly operation: string;
  readonly chunks: AsyncIterable<Uint8Array>;
  readonly fail: FrameFailure;
}

/** The sentinel an OpenAI shaped stream writes instead of a last frame. */
const DONE = '[DONE]';

/**
 * The payload of one event: only `data:` lines carry one. A `:` line is a comment, every other field
 * (`event:`, `id:`, `retry:`) is metadata, and several data lines of one event are joined with a newline,
 * which is what the event stream format specifies.
 */
function eventPayload(block: string): string | null {
  const data: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');

    if (line === '' || line.startsWith(':')) {
      continue;
    }

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);

    if (field !== 'data') {
      continue;
    }

    const value = colon === -1 ? '' : line.slice(colon + 1);
    data.push(value.startsWith(' ') ? value.slice(1) : value);
  }

  return data.length === 0 ? null : data.join('\n');
}

function parseFrame(payload: string, input: ReadSseFramesInput): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw input.fail('invalid_response', `${input.label} sent a frame that is not JSON for ${input.operation}`);
  }
}

/**
 * The frames of one provider stream. Boundaries are looked for on the decoded text rather than per socket
 * read, because a frame can arrive split across two reads and one read can carry several frames: neither
 * is a decision of the provider. `[DONE]` ends the iteration and yields nothing, so no translator has to
 * know the sentinel.
 */
export async function* readSseFrames(input: ReadSseFramesInput): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of input.chunks) {
    buffer += decoder.decode(chunk, { stream: true });

    for (;;) {
      const boundary = /\r?\n\r?\n/.exec(buffer);

      if (boundary === null) {
        break;
      }

      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);

      const payload = eventPayload(block);

      if (payload === null) {
        continue;
      }

      if (payload.trim() === DONE) {
        return;
      }

      yield parseFrame(payload, input);
    }
  }

  // A last event that arrived without its closing blank line still counts.
  const tail = eventPayload(buffer);

  if (tail !== null && tail.trim() !== DONE) {
    yield parseFrame(tail, input);
  }
}

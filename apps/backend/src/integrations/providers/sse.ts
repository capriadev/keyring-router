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

/** A frame terminator is CRLF, LF or a lone CR, and an event ends where two of them meet. */
const EVENT_BOUNDARY = /(?:\r\n|\r|\n){2}/;

/** The separator between the lines of one event, with the same three terminators. */
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * The ceiling on the text waiting for a terminator. A provider that opens an event and never closes it has
 * to fail as a broken response instead of growing this process until it dies: measured before the fix, 64 MB
 * of unterminated data produced zero frames, 422 MB of heap and no failure until the body closed. The
 * ceiling counts what is pending, never the stream, so an answer of any size still arrives as long as its
 * frames keep closing.
 */
const MAX_PENDING_CHARS = 8 * 1024 * 1024;

/**
 * The payload of one event: only `data:` lines carry one. A `:` line is a comment, every other field
 * (`event:`, `id:`, `retry:`) is metadata, and several data lines of one event are joined with a newline,
 * which is what the event stream format specifies.
 */
function eventPayload(block: string): string | null {
  const data: string[] = [];

  for (const line of block.split(LINE_BREAK)) {
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
      const boundary = EVENT_BOUNDARY.exec(buffer);

      if (boundary === null) {
        if (buffer.length > MAX_PENDING_CHARS) {
          throw input.fail(
            'invalid_response',
            `${input.label} sent more than ${MAX_PENDING_CHARS} characters without closing an event for ${input.operation}`,
          );
        }

        break;
      }

      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);

      const payload = eventPayload(block);

      // A block that carries no data is not a frame: a comment, a keep-alive, or an empty `data:` line. The
      // format allows all three, so none of them may end the stream.
      if (payload === null || payload.trim() === '') {
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

  if (tail !== null && tail.trim() !== '' && tail.trim() !== DONE) {
    yield parseFrame(tail, input);
  }
}

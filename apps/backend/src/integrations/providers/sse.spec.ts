import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ProviderFailure, type ProviderErrorKind } from '../../types/provider.js';
import { readSseFrames, type ReadSseFramesInput } from './sse.js';

const fail = (kind: ProviderErrorKind, message: string): ProviderFailure =>
  new ProviderFailure('probe' as never, kind, message);

/** Feeds the reader the chunks a test declares, one by one, as the socket would. */
function feed(chunks: readonly string[]): ReadSseFramesInput {
  const encoder = new TextEncoder();

  return {
    label: 'Probe provider',
    operation: 'POST its chat endpoint',
    chunks: (async function* () {
      for (const chunk of chunks) {
        yield encoder.encode(chunk);
      }
    })(),
    fail,
  };
}

async function collect(input: ReadSseFramesInput): Promise<unknown[]> {
  const frames: unknown[] = [];

  for await (const frame of readSseFrames(input)) {
    frames.push(frame);
  }

  return frames;
}

function assertInvalidResponse(error: unknown): boolean {
  assert.ok(error instanceof ProviderFailure, 'the failure must be a provider failure');
  assert.equal(
    error instanceof ProviderFailure ? error.kind : 'not a provider failure',
    'invalid_response',
  );

  return true;
}

describe('readSseFrames', () => {
  it('yields a frame that arrived split across two reads', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":', '1}\n\n'])), [{ a: 1 }]);
  });

  it('takes a CRLF split across two reads as one terminator, not as a blank line', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":1}\r', '\n\r\n'])), [{ a: 1 }]);
  });

  it('reads a frame whose lines end with a lone CR', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":1}\r\r'])), [{ a: 1 }]);
  });

  it('skips an empty data line instead of failing the stream', async () => {
    assert.deepEqual(await collect(feed(['data:\n\n', 'data: {"a":1}\n\n'])), [{ a: 1 }]);
  });

  it('skips a data line that carries no colon', async () => {
    assert.deepEqual(await collect(feed(['data\n\n', 'data: {"a":1}\n\n'])), [{ a: 1 }]);
  });

  it('skips comments and metadata blocks the format allows', async () => {
    assert.deepEqual(
      await collect(feed([': keep-alive\n\n', 'event: message\nid: 7\n\n', 'data: {"a":1}\n\n'])),
      [{ a: 1 }],
    );
  });

  it('joins the data lines of one event with a newline', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":\ndata: 1}\n\n'])), [{ a: 1 }]);
  });

  it('ends the iteration at the sentinel without yielding it', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":1}\n\n', 'data: [DONE]\n\n', 'data: {"a":2}\n\n'])), [
      { a: 1 },
    ]);
  });

  it('yields a last event that arrived without its closing blank line', async () => {
    assert.deepEqual(await collect(feed(['data: {"a":1}'])), [{ a: 1 }]);
  });

  it('fails a frame that is not JSON', async () => {
    await assert.rejects(() => collect(feed(['data: not json\n\n'])), assertInvalidResponse);
  });

  it('fails instead of accumulating an event no provider ever closes', async () => {
    const megabyte = 'x'.repeat(1024 * 1024);

    await assert.rejects(
      () => collect(feed(Array.from({ length: 9 }, () => megabyte))),
      assertInvalidResponse,
    );
  });
});

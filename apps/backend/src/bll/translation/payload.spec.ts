import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FrameReport } from '../../types/chat.js';
import { openAiCodec } from './codecs/openai.codec.js';
import { countFrameDrops } from './frame-report.js';
import { parseFrame, STREAM_DONE } from './payload.js';

/** Records every report a translator makes, in order, as `code: detail`. */
function recorder(): { readonly report: FrameReport; readonly lines: readonly string[] } {
  const lines: string[] = [];

  return {
    report: (code, detail) => {
      lines.push(`${code}: ${detail}`);
    },
    lines,
  };
}

describe('a frame that carries something and is not an object', () => {
  it('is reported with the shape that arrived and answers null', () => {
    const { report, lines } = recorder();

    assert.equal(parseFrame(42, report), null);
    assert.equal(parseFrame([{ type: 'message' }], report), null);
    assert.deepEqual(lines, [
      'frame_dropped: a stream frame arrived as number',
      'frame_dropped: a stream frame arrived as an array',
    ]);
  });

  it('is reported when it arrived as text that parsed to a primitive', () => {
    const { report, lines } = recorder();

    assert.equal(parseFrame('42', report), null);
    assert.equal(parseFrame('"hola"', report), null);
    assert.deepEqual(lines, [
      'frame_dropped: a stream frame parsed to number',
      'frame_dropped: a stream frame parsed to string',
    ]);
  });

  it('never names the content of the frame it dropped', () => {
    const { report, lines } = recorder();

    parseFrame([{ prompt: 'sk-secret-value' }], report);

    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes('sk-secret-value'), false);
  });
});

describe('a frame that genuinely carries nothing', () => {
  it('answers null without reporting anything', () => {
    const { report, lines } = recorder();

    for (const empty of [null, undefined, '', '   ', STREAM_DONE]) {
      assert.equal(parseFrame(empty, report), null);
    }

    assert.deepEqual(lines, []);
  });

  it('keeps an object frame untouched, with nothing reported', () => {
    const { report, lines } = recorder();
    const frame = { choices: [] };

    assert.equal(parseFrame(frame, report), frame);
    assert.equal(parseFrame('{"choices":[]}', report)?.choices instanceof Array, true);
    assert.deepEqual(lines, []);
  });

  it('still fails loudly when the text is not JSON at all', () => {
    const { report, lines } = recorder();

    assert.throws(() => parseFrame('{oops', report), /not valid JSON/);
    assert.deepEqual(lines, []);
  });
});

describe('the translator that reads the frames', () => {
  it('passes the report down, so a dropped frame reaches the caller', () => {
    const { report, lines } = recorder();

    assert.deepEqual(openAiCodec.decodeChunk(42, report), []);
    assert.deepEqual(lines, ['frame_dropped: a stream frame arrived as number']);

    assert.deepEqual(openAiCodec.decodeChunk({ choices: [] }, report), []);
    assert.equal(lines.length, 1);
  });
});

describe('the count of one request', () => {
  it('says nothing when no frame was dropped', () => {
    const drops = countFrameDrops();

    assert.equal(drops.line('abc'), null);
  });

  it('writes one line with the request, the stable code and the count, and no frame', () => {
    const drops = countFrameDrops();

    drops.report('frame_dropped', 'a stream frame arrived as number');
    drops.report('frame_dropped', 'a stream frame parsed to string');

    assert.equal(drops.line('abc'), 'route request=abc outcome=frame_dropped frames=2');
    assert.equal(drops.line('abc')?.includes('number'), false);
  });
});

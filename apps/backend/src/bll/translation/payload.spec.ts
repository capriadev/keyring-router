import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FrameDrop, FrameReport } from '../../types/chat.js';
import { geminiCodec } from './codecs/gemini.codec.js';
import { openAiCodec } from './codecs/openai.codec.js';
import { countFrameDrops } from './frame-report.js';
import { parseFrame, STREAM_DONE } from './payload.js';

/** Records every drop a translator reports, structured and in order, never as a formatted string. */
function recorder(): { readonly report: FrameReport; readonly drops: readonly FrameDrop[] } {
  const drops: FrameDrop[] = [];

  return {
    report: (_code, drop) => {
      drops.push(drop);
    },
    drops,
  };
}

describe('a frame that carries something and is not an object', () => {
  it('is reported with the shape that arrived and answers null', () => {
    const { report, drops } = recorder();

    assert.equal(parseFrame(42, report), null);
    assert.equal(parseFrame([{ type: 'message' }], report), null);
    assert.deepEqual(drops, [
      { reason: 'not_an_object', shape: 'number' },
      { reason: 'not_an_object', shape: 'array' },
    ]);
  });

  it('is reported when it arrived as text that parsed to a primitive', () => {
    const { report, drops } = recorder();

    assert.equal(parseFrame('42', report), null);
    assert.equal(parseFrame('"hola"', report), null);
    assert.deepEqual(drops, [
      { reason: 'parsed_not_an_object', shape: 'number' },
      { reason: 'parsed_not_an_object', shape: 'string' },
    ]);
  });

  it('never carries the content of the frame it dropped, because the shapes are a closed list', () => {
    const { report, drops } = recorder();

    parseFrame([{ prompt: 'sk-secret-value' }], report);
    parseFrame('"sk-secret-value"', report);

    assert.equal(drops.length, 2);
    assert.equal(JSON.stringify(drops).includes('sk-secret-value'), false);
    assert.deepEqual(
      drops.map((drop) => Object.keys(drop).sort()),
      [
        ['reason', 'shape'],
        ['reason', 'shape'],
      ],
    );
  });
});

describe('a frame that genuinely carries nothing', () => {
  it('answers null without reporting anything', () => {
    const { report, drops } = recorder();

    for (const empty of [null, undefined, '', '   ', STREAM_DONE]) {
      assert.equal(parseFrame(empty, report), null);
    }

    assert.deepEqual(drops, []);
  });

  it('keeps an object frame untouched, with nothing reported', () => {
    const { report, drops } = recorder();
    const frame = { choices: [] };

    assert.equal(parseFrame(frame, report), frame);
    assert.equal(parseFrame('{"choices":[]}', report)?.choices instanceof Array, true);
    assert.deepEqual(drops, []);
  });

  it('still fails loudly when the text is not JSON at all', () => {
    const { report, drops } = recorder();

    assert.throws(() => parseFrame('{oops', report), /not valid JSON/);
    assert.deepEqual(drops, []);
  });
});

describe('a field that is present with a shape the codec does not model', () => {
  it('is reported by the openai codec with its field and its shape', () => {
    const { report, drops } = recorder();

    assert.deepEqual(openAiCodec.decodeChunk({ choices: 'nonsense' }, report), []);
    assert.deepEqual(openAiCodec.decodeChunk({ choices: [42] }, report), []);
    assert.deepEqual(openAiCodec.decodeChunk({ choices: [{ delta: 5 }] }, report), []);

    assert.deepEqual(drops, [
      { reason: 'unexpected_field_shape', field: 'choices', shape: 'string' },
      { reason: 'unexpected_field_shape', field: 'choices', shape: 'number' },
      { reason: 'unexpected_field_shape', field: 'delta', shape: 'number' },
    ]);
  });

  it('is reported by the gemini codec with its field and its shape', () => {
    const { report, drops } = recorder();

    assert.deepEqual(geminiCodec.decodeChunk({ candidates: [{ content: 7 }] }, report), []);
    assert.deepEqual(geminiCodec.decodeChunk({ candidates: [{ content: { parts: 'x' } }] }, report), []);

    const partly = geminiCodec.decodeChunk({ candidates: [{ content: { parts: [1, { text: 'hola' }] } }] }, report);

    assert.deepEqual(drops, [
      { reason: 'unexpected_field_shape', field: 'content', shape: 'number' },
      { reason: 'unexpected_field_shape', field: 'parts', shape: 'string' },
      { reason: 'unexpected_field_shape', field: 'parts', shape: 'number' },
    ]);
    // The part it could read still reaches the client: one unreadable part does not lose the rest.
    assert.deepEqual(partly, [{ delta: 'hola' }]);
  });

  it('reads the field once, so a value that answers differently on each read cannot change the outcome', () => {
    const { report, drops } = recorder();
    let reads = 0;
    const frame = {
      get choices(): unknown {
        reads += 1;

        return reads === 1 ? [] : [{ delta: { content: 'hola' } }];
      },
    };

    assert.deepEqual(openAiCodec.decodeChunk(frame, report), []);
    assert.equal(reads, 1, 'the field must be read once');
    assert.deepEqual(drops, []);
  });

  it('is not reported when the field is absent or the array is empty, because that carries nothing', () => {
    const { report, drops } = recorder();

    // OpenAI's final usage chunk has no choices at all: it carries the usage and nothing to report.
    const openAiUsage = openAiCodec.decodeChunk({ usage: { total_tokens: 3 } }, report);

    assert.equal(openAiUsage.length, 1);
    assert.equal(openAiUsage[0].usage?.totalTokens, 3);
    assert.deepEqual(openAiCodec.decodeChunk({ choices: [] }, report), []);

    // Gemini's usage frame, and a candidate whose parts are absent.
    const geminiUsage = geminiCodec.decodeChunk({ usageMetadata: { totalTokenCount: 3 } }, report);

    assert.equal(geminiUsage.length, 1);
    assert.equal(geminiUsage[0].usage?.totalTokens, 3);
    assert.deepEqual(geminiCodec.decodeChunk({ candidates: [{ content: {} }] }, report), []);

    assert.deepEqual(drops, []);
  });
});

describe('the translator that reads the frames', () => {
  it('passes the report down, so a dropped frame reaches the caller', () => {
    const { report, drops } = recorder();

    assert.deepEqual(openAiCodec.decodeChunk(42, report), []);
    assert.deepEqual(drops, [{ reason: 'not_an_object', shape: 'number' }]);
  });
});

describe('the count of one request', () => {
  it('says nothing when no frame was dropped', () => {
    const drops = countFrameDrops();

    assert.equal(drops.line('abc'), null);
  });

  it('writes one line with the request, the stable code, the number of drops and the distinct reasons', () => {
    const drops = countFrameDrops();

    drops.report('frame_dropped', { reason: 'not_an_object', shape: 'number' });
    drops.report('frame_dropped', { reason: 'not_an_object', shape: 'array' });
    drops.report('frame_dropped', { reason: 'parsed_not_an_object', shape: 'string' });

    assert.equal(
      drops.line('abc'),
      'route request=abc outcome=frame_dropped drops=3 reasons=not_an_object,parsed_not_an_object',
    );
    assert.equal(drops.line('abc')?.includes('number'), false);
  });

  it('counts drops, not frames: one frame with three unreadable parts is three', () => {
    const { report } = recorder();
    const drops = countFrameDrops();

    geminiCodec.decodeChunk({ candidates: [{ content: { parts: [1, 2, 3] } }] }, (code, drop) => {
      report(code, drop);
      drops.report(code, drop);
    });

    assert.equal(drops.line('req-a'), 'route request=req-a outcome=frame_dropped drops=3 reasons=unexpected_field_shape');
  });

  it('reads the reason once, so a value that answers differently on each read cannot slip through', () => {
    const drops = countFrameDrops();
    let reads = 0;
    const sneaky = {
      get reason(): string {
        reads += 1;

        return reads === 1 ? 'not_an_object' : 'LEAKED-PROVIDER-TEXT';
      },
    } as unknown as FrameDrop;

    drops.report('frame_dropped', sneaky);

    assert.equal(drops.line('abc'), 'route request=abc outcome=frame_dropped drops=1 reasons=not_an_object');
    assert.equal(reads, 1, 'the reason must be read once and only once');
  });

  it('writes only a reason it knows, even when a forced value reaches the port', () => {
    const drops = countFrameDrops();
    const forced = { reason: JSON.stringify({ prompt: 'sk-secret-value' }) } as unknown as FrameDrop;

    drops.report('frame_dropped', forced);

    assert.equal(drops.line('abc'), 'route request=abc outcome=frame_dropped drops=1 reasons=unrecognized');
    assert.equal(drops.line('abc')?.includes('sk-secret-value'), false);
  });
});

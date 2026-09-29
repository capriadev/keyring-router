import type {
  ChatChunk,
  ChatFormat,
  ChatRequest,
  ChatResponse,
  TranslateRequestOptions,
} from '../../../types/chat.js';

/**
 * Example payloads, one set per protocol, as fixtures. They are the only source of provider shapes in the
 * tests: no test reaches a provider, and every frame sequence is declared here so a spec asserts the frames
 * and not just the text they add up to.
 */
export const UPSTREAM_MODEL = 'upstream-model-1';

/**
 * A request with everything a translator must carry: a system prompt, text, an inline image, a tool
 * declaration, a tool call with its arguments as JSON text and the answer of that call.
 */
export const RICH_REQUEST: ChatRequest = {
  model: 'ns/modelo',
  stream: false,
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 256,
  tools: [
    {
      name: 'sumar',
      description: 'Suma dos numeros',
      parameters: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
  ],
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'Sos un asistente.' }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Cuanto es 1+2?' },
        { type: 'image', url: 'data:image/png;base64,QUJD', mediaType: 'image/png' },
      ],
    },
    {
      role: 'assistant',
      content: [],
      toolCalls: [{ id: 'call_1', name: 'sumar', arguments: '{"a":1,"b":2}' }],
    },
    { role: 'tool', toolCallId: 'call_1', name: 'sumar', content: [{ type: 'text', text: '3' }] },
  ],
};

export const REQUEST_OPTIONS: TranslateRequestOptions = {
  model: UPSTREAM_MODEL,
  stream: true,
  unsupportedParams: [],
  requestDefaults: { maxTokens: 16384, topK: 5 },
};

export interface FormatFixture {
  /** A complete provider answer, in the provider's own shape. */
  readonly response: unknown;
  /** The same answer, normalized. */
  readonly expectedResponse: ChatResponse;
  /** The frames of one streamed answer, in arrival order, including frames that carry nothing. */
  readonly frames: readonly unknown[];
  /** What each frame translates to: the sequence a client sees, one entry per frame. */
  readonly expectedChunks: readonly (readonly ChatChunk[])[];
}

export const OPENAI_ARGUMENTS = '{"a":1,"b":2}';

/**
 * The same JSON text, split the way each protocol streams it: openai in argument fragments, claude in partial
 * json, gemini in one piece. A spec concatenates the fragments a translation emitted and compares.
 */
export const ARGUMENT_FRAGMENTS: Readonly<Record<ChatFormat, readonly string[]>> = {
  openai: ['{"a"', ':1,"b":2}'],
  claude: ['{"a"', ':1,"b":2}'],
  gemini: ['{"a":1,"b":2}'],
  ollama: ['{"a"', ':1,"b":2}'],
};

const OPENAI_USAGE = { promptTokens: 11, completionTokens: 7, totalTokens: 18 };

export const OPENAI_FIXTURE: FormatFixture = {
  response: {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hola',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'sumar', arguments: OPENAI_ARGUMENTS } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  },
  expectedResponse: {
    text: 'Hola',
    toolCalls: [{ id: 'call_1', name: 'sumar', arguments: OPENAI_ARGUMENTS }],
    finishReason: 'tool_calls',
    usage: OPENAI_USAGE,
  },
  frames: [
    { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
    '{"choices":[{"index":0,"delta":{"content":"Ho"},"finish_reason":null}]}',
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', type: 'function', function: { name: 'sumar', arguments: '{"a"' } },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: ':1,"b":2}' } }] },
          finish_reason: null,
        },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    '[DONE]',
    { choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } },
  ],
  expectedChunks: [
    [],
    [{ delta: 'Ho' }],
    [{ toolCallDelta: { index: 0, id: 'call_1', name: 'sumar', arguments: '{"a"' } }],
    [{ toolCallDelta: { index: 0, arguments: ':1,"b":2}' } }],
    [{ finishReason: 'tool_calls' }],
    [],
    [{ usage: OPENAI_USAGE }],
  ],
};

export const CLAUDE_FIXTURE: FormatFixture = {
  response: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Hola' },
      { type: 'tool_use', id: 'toolu_1', name: 'sumar', input: { a: 1, b: 2 } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 11, output_tokens: 7 },
  },
  expectedResponse: {
    text: 'Hola',
    toolCalls: [{ id: 'toolu_1', name: 'sumar', arguments: OPENAI_ARGUMENTS }],
    finishReason: 'tool_calls',
    usage: OPENAI_USAGE,
  },
  frames: [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [],
        usage: { input_tokens: 11, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ho' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'sumar', input: {} },
    },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"a"' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':1,"b":2}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } },
    { type: 'message_stop' },
    { type: 'ping' },
  ],
  expectedChunks: [
    [{ usage: { promptTokens: 11, completionTokens: 1, totalTokens: 12 } }],
    [],
    [{ delta: 'Ho' }],
    [],
    [{ toolCallDelta: { index: 1, id: 'toolu_1', name: 'sumar' } }],
    [{ toolCallDelta: { index: 1, arguments: '{"a"' } }],
    [{ toolCallDelta: { index: 1, arguments: ':1,"b":2}' } }],
    [],
    [{ finishReason: 'tool_calls' }, { usage: { promptTokens: null, completionTokens: 7, totalTokens: null } }],
    [],
    [],
  ],
};

export const GEMINI_FIXTURE: FormatFixture = {
  response: {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text: 'Hola' }, { functionCall: { name: 'sumar', args: { a: 1, b: 2 } } }],
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
  },
  expectedResponse: {
    text: 'Hola',
    toolCalls: [{ id: 'gemini_call_0', name: 'sumar', arguments: OPENAI_ARGUMENTS }],
    finishReason: 'stop',
    usage: OPENAI_USAGE,
  },
  frames: [
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Ho' }] }, index: 0 }] },
    {
      candidates: [
        { content: { role: 'model', parts: [{ functionCall: { name: 'sumar', args: { a: 1, b: 2 } } }] }, index: 0 },
      ],
    },
    { candidates: [{ content: { parts: [{ thought: true, text: 'sumando' }] }, index: 0 }] },
    {
      candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
    },
  ],
  expectedChunks: [
    [{ delta: 'Ho' }],
    [{ toolCallDelta: { index: 0, id: 'gemini_call_0', name: 'sumar', arguments: OPENAI_ARGUMENTS } }],
    [],
    [{ finishReason: 'stop' }, { usage: OPENAI_USAGE }],
  ],
};

/**
 * Ollama's chat endpoint is OpenAI shaped, so the example answer and the example frames are the same ones:
 * the translation towards ollama reads exactly this. Discovery is the only place where ollama has its own
 * shape, and discovery never goes through a translator.
 */
export const OLLAMA_FIXTURE: FormatFixture = OPENAI_FIXTURE;

export const FORMAT_FIXTURES: Readonly<Record<ChatFormat, FormatFixture>> = {
  openai: OPENAI_FIXTURE,
  claude: CLAUDE_FIXTURE,
  gemini: GEMINI_FIXTURE,
  ollama: OLLAMA_FIXTURE,
};

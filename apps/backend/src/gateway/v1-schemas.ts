import { z } from 'zod';

/**
 * The `/v1` boundary: shape only. Every object here is loose on purpose, because a parameter this
 * facade does not model must travel to the provider instead of being dropped by the validator; the
 * chat contract carries those fields through `passthrough`. Domain rules (does the model exist, is it
 * exposed, can the provider be called) belong to `bll/`, never to a schema.
 */

/**
 * A model id is an identifier the catalog knows. The length bound is what the contract asked for; the
 * character rule refuses every non-printable character, because the router interpolates this id into its
 * line and an invisible one changes how that line reads. `Cc` are the control characters, `Cf` the format
 * ones such as a bidirectional override, `Zl` and `Zp` the line and paragraph separators. Spec 019, which
 * widened what spec 018 left as `Cc` only, after the audit of 018 measured a format character reaching a
 * resolved line.
 */
const modelSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u, 'a model id must not carry control, format or separator characters');

const openAiContentPartSchema = z.looseObject({
  type: z.string().min(1),
  text: z.string().nullish(),
  image_url: z.looseObject({ url: z.string().nullish() }).nullish(),
});

const openAiToolCallSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().nullish(),
  function: z.looseObject({
    name: z.string().min(1),
    arguments: z.string().nullish(),
  }),
});

const openAiMessageSchema = z.looseObject({
  role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(openAiContentPartSchema), z.null()]).optional(),
  tool_calls: z.array(openAiToolCallSchema).nullish(),
  tool_call_id: z.string().nullish(),
  name: z.string().nullish(),
});

const openAiToolSchema = z.looseObject({
  type: z.string().nullish(),
  function: z.looseObject({
    name: z.string().min(1),
    description: z.string().nullish(),
    parameters: z.unknown().optional(),
  }),
});

/** `POST /v1/chat/completions` */
export const openAiChatBodySchema = z.looseObject({
  model: modelSchema,
  messages: z.array(openAiMessageSchema).min(1),
  stream: z.boolean().nullish(),
  tools: z.array(openAiToolSchema).nullish(),
  temperature: z.number().nullish(),
  top_p: z.number().nullish(),
  max_tokens: z.number().int().positive().nullish(),
  max_completion_tokens: z.number().int().positive().nullish(),
});

const claudeImageSourceSchema = z.looseObject({
  type: z.string().min(1),
  media_type: z.string().nullish(),
  data: z.string().nullish(),
  url: z.string().nullish(),
});

const claudeContentBlockSchema = z.looseObject({
  type: z.string().min(1),
  text: z.string().nullish(),
  source: claudeImageSourceSchema.nullish(),
  id: z.string().nullish(),
  name: z.string().nullish(),
  input: z.unknown().optional(),
  tool_use_id: z.string().nullish(),
  content: z
    .union([z.string(), z.array(z.looseObject({ type: z.string().min(1), text: z.string().nullish() }))])
    .nullish(),
});

const claudeMessageSchema = z.looseObject({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(claudeContentBlockSchema)]),
});

const claudeToolSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().nullish(),
  input_schema: z.unknown().optional(),
});

/** `POST /v1/messages`. `max_tokens` is required by the Messages API, so it is required here. */
export const claudeMessagesBodySchema = z.looseObject({
  model: modelSchema,
  max_tokens: z.number().int().positive(),
  messages: z.array(claudeMessageSchema).min(1),
  system: z.union([z.string(), z.array(claudeContentBlockSchema)]).nullish(),
  stream: z.boolean().nullish(),
  tools: z.array(claudeToolSchema).nullish(),
  temperature: z.number().nullish(),
  top_p: z.number().nullish(),
});

export type OpenAiChatBody = z.infer<typeof openAiChatBodySchema>;

export type ClaudeMessagesBody = z.infer<typeof claudeMessagesBodySchema>;

import { z } from 'zod';

/**
 * `GET /api/version` payload. Documented shape: `{ "version": "0.12.6" }`.
 * This single field is the credential check for `authKind: 'none'`.
 */
export const ollamaVersionResponseSchema = z.object({
  version: z.string().min(1),
});

export type OllamaVersionResponse = z.infer<typeof ollamaVersionResponseSchema>;

/**
 * One entry of `GET /api/tags`. Documented shape (`ModelSummary`):
 * `{ name, model, remote_model?, remote_host?, modified_at, size, digest, details: { format, family, families?, parameter_size, quantization_level } }`.
 * Ollama renamed `name` to `model` and reports both, so either one identifies the model.
 *
 * Reference data tolerates `null` and is degraded to `null` by the adapter, so one odd optional field never
 * invalidates an entire catalog. The identifier stays strict: a model we cannot name is unusable.
 * Fields the adapter does not read are stripped by Zod (`digest`, `format`, `families`, `parameter_size`,
 * `quantization_level`, `remote_*`).
 */
export const ollamaModelSummarySchema = z
  .object({
    name: z.string().min(1).nullish(),
    model: z.string().min(1).nullish(),
    modified_at: z.string().nullish(),
    size: z.number().int().nonnegative().nullish(),
    details: z
      .object({
        family: z.string().nullish(),
      })
      .nullish(),
  })
  .refine((summary) => summary.name !== undefined || summary.model !== undefined, {
    message: 'model entry has no identifier',
  });

export type OllamaModelSummary = z.infer<typeof ollamaModelSummarySchema>;

/** `GET /api/tags` payload. Documented shape: `{ "models": [ ... ] }`. */
export const ollamaTagsResponseSchema = z.object({
  models: z.array(ollamaModelSummarySchema),
});

export type OllamaTagsResponse = z.infer<typeof ollamaTagsResponseSchema>;

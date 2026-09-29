/**
 * Provider catalog: local providers.
 *
 * Adapted from OmniRoute (MIT), Copyright (c) 2026 diegosouzapw.
 * The `source` field of every entry names the OmniRoute registry file it was read from. OmniRoute
 * fields that only mean something inside their runtime (executor, oauth, test key endpoints,
 * reasoning transport) were dropped, and no credential value, cookie or session is carried here.
 *
 * Family membership comes from OmniRoute `src/shared/constants/providers/local.ts`, where every
 * entry states that no API key is required, so `authType` is `none`.
 * The endpoints are the documented defaults of each local server; a credential overrides the base URL.
 */
import type { ProviderCatalogEntry } from '../../../types/provider-catalog.js';

export const LOCAL_PROVIDERS: readonly ProviderCatalogEntry[] = [
  {
    id: 'mlx-gemma',
    alias: 'mlx-gemma',
    displayName: 'MLX Gemma 26B',
    format: 'openai',
    baseUrl: 'http://localhost:11435/v1/chat/completions',
    authType: 'none',
    models: [
      {
        id: 'mlx-community/gemma-4-26B-A4B-it-qat-q4_0-mlx-aligned',
        displayName: 'Gemma 4 26B A4B IT-QAT (MLX)',
        contextLength: 8192,
        maxOutputTokens: 8192,
        supportsReasoning: false,
        supportsVision: false,
      },
    ],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/mlx/index.ts',
  },
  {
    id: 'mlx-qwen',
    alias: 'mlx-qwen',
    displayName: 'MLX Qwen 3.8 27B',
    format: 'openai',
    baseUrl: 'http://localhost:11436/v1/chat/completions',
    authType: 'none',
    models: [
      {
        id: 'maglun/Qwen3.8-27B-MLX-Mixed-3.80bpw',
        displayName: 'Qwen 3.8 27B MLX Mixed 3.80bpw',
        contextLength: 8192,
        maxOutputTokens: 8192,
        supportsReasoning: false,
        supportsVision: false,
      },
    ],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/mlx/index.ts',
  },
];

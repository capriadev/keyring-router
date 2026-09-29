/**
 * Provider catalog: no auth providers.
 *
 * Adapted from OmniRoute (MIT), Copyright (c) 2026 diegosouzapw.
 * The `source` field of every entry names the OmniRoute registry file it was read from. OmniRoute
 * fields that only mean something inside their runtime (executor, oauth, test key endpoints,
 * reasoning transport) were dropped, and no credential value, cookie or session is carried here.
 *
 * Family membership comes from OmniRoute `src/shared/constants/providers/noauth.ts`.
 * Entries that drive a local CLI over stdio or a reverse engineered browser session are left out:
 * they are not HTTP chat providers.
 */
import type { ProviderCatalogEntry } from '../../../types/provider-catalog.js';

export const NO_AUTH_PROVIDERS: readonly ProviderCatalogEntry[] = [
  {
    id: 'aihorde',
    alias: 'aihorde',
    displayName: 'AI Horde',
    format: 'openai',
    baseUrl: 'https://oai.aihorde.net/v1/chat/completions',
    authType: 'none',
    models: [
      {
        id: 'aphrodite/TheDrummer/Cydonia-24B-v4.3',
        displayName: 'Cydonia 24B (AI Horde)',
        contextLength: 32768,
        unsupportedParams: ['tools', 'tool_choice', 'parallel_tool_calls'],
      },
      {
        id: 'aphrodite/TheDrummer/Skyfall-31B-v4.2',
        displayName: 'Skyfall 31B (AI Horde)',
        contextLength: 32768,
        unsupportedParams: ['tools', 'tool_choice', 'parallel_tool_calls'],
      },
      {
        id: 'google/gemma-4-31b',
        displayName: 'Gemma 4 31B (AI Horde)',
        contextLength: 32768,
        unsupportedParams: ['tools', 'tool_choice', 'parallel_tool_calls'],
      },
    ],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/aihorde/index.ts',
  },
  {
    id: 'opencode',
    alias: 'oc',
    displayName: 'OpenCode Free',
    format: 'openai',
    baseUrl: 'https://opencode.ai/zen/v1/chat/completions',
    authType: 'none',
    models: [
      { id: 'big-pickle', displayName: 'Big Pickle', supportsReasoning: true },
      {
        id: 'deepseek-v4-flash-free',
        displayName: 'DeepSeek V4 Flash Free',
        supportsReasoning: true,
      },
      { id: 'mimo-v2.5-free', displayName: 'MiMo V2.5 Free', contextLength: 131000 },
      { id: 'hy3-free', displayName: 'HY3 Free', contextLength: 131000 },
      { id: 'nemotron-3-ultra-free', displayName: 'Nemotron 3 Ultra Free', contextLength: 1000000 },
      { id: 'north-mini-code-free', displayName: 'North Mini Code Free', contextLength: 131000 },
    ],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/opencode/index.ts',
  },
  {
    id: 'uncloseai',
    alias: 'unc',
    displayName: 'UncloseAI',
    format: 'openai',
    baseUrl: 'https://hermes.ai.unturf.com/v1/chat/completions',
    authType: 'none',
    models: [
      {
        id: 'Lorbus/Qwen3.6-27B-int4-AutoRound',
        displayName: 'Qwen3.6 27B int4 AutoRound ( Free)',
        contextLength: 65536,
      },
    ],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/uncloseai/index.ts',
  },
];

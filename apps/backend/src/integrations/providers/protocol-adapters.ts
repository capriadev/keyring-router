import { ClaudeAdapter } from './claude/claude.adapter.js';
import { GeminiAdapter } from './gemini/gemini.adapter.js';
import { createOllamaProtocolAdapter } from './ollama/ollama.protocol-adapter.js';
import { OpenAiCompatibleAdapter } from './openai-compatible/openai-compatible.adapter.js';
import type { ProtocolAdapter } from './protocol-adapter.js';

/**
 * One adapter per protocol. This list is the only place the adapter set is composed, so a new protocol is
 * added here once instead of once per provider.
 */
export function createProtocolAdapters(): readonly ProtocolAdapter[] {
  return [
    new OpenAiCompatibleAdapter(),
    new ClaudeAdapter(),
    new GeminiAdapter(),
    createOllamaProtocolAdapter(),
  ];
}

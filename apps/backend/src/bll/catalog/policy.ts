import type { PolicyRule } from '../../types/policy.js';

const MAX_PATTERN_LENGTH = 200;
const UNSUPPORTED_GLOB_CHARS = /[[\]{}\\]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface PolicyTarget {
  readonly credentialId: string;
  /** Namespaced model id, the value a pattern is matched against. */
  readonly namespacedId: string;
}

/**
 * Reason the pattern cannot be stored, or null when it can. Only `*` and `?` are supported, so any
 * other glob syntax is reported instead of being silently matched as a literal.
 */
export function patternProblem(pattern: string): string | null {
  if (pattern.length === 0) {
    return 'pattern must not be empty';
  }

  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern must not exceed ${MAX_PATTERN_LENGTH} characters`;
  }

  if (CONTROL_CHARS.test(pattern)) {
    return 'pattern must not contain control characters';
  }

  if (UNSUPPORTED_GLOB_CHARS.test(pattern)) {
    return 'pattern supports only the * and ? wildcards';
  }

  return null;
}

function toRegexSource(pattern: string): string {
  return [...pattern]
    .map((char) => {
      if (char === '*') {
        return '.*';
      }

      if (char === '?') {
        return '.';
      }

      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

/** Case-insensitive match of one pattern against one namespaced model id. */
export function matchPattern(pattern: string, value: string): boolean {
  return new RegExp(`^${toRegexSource(pattern)}$`, 'i').test(value);
}

/**
 * Exposure decision. Deny wins: one matching deny denies, otherwise at least one matching allow
 * exposes, otherwise deny. Order-independent and stateless.
 */
export function evaluateExposure(rules: readonly PolicyRule[], target: PolicyTarget): boolean {
  let allowed = false;

  for (const rule of rules) {
    if (rule.credentialId !== null && rule.credentialId !== target.credentialId) {
      continue;
    }

    if (!matchPattern(rule.pattern, target.namespacedId)) {
      continue;
    }

    if (rule.effect === 'deny') {
      return false;
    }

    allowed = true;
  }

  return allowed;
}

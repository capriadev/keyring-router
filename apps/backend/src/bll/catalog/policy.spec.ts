import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PolicyRule } from '../../types/policy.js';
import { evaluateExposure, matchPattern, patternProblem } from './policy.js';

const credentialId = 'credential-1';
const target = { credentialId, namespacedId: 'local/qwen2.5:7b' };

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'rule',
    credentialId: null,
    pattern: 'local/*',
    effect: 'allow',
    createdAt: 1,
    ...overrides,
  };
}

describe('patternProblem', () => {
  it('accepts a literal pattern and the two supported wildcards', () => {
    assert.equal(patternProblem('local/qwen2.5:7b'), null);
    assert.equal(patternProblem('local/*'), null);
    assert.equal(patternProblem('local/qwen?.5:7b'), null);
  });

  it('rejects an empty pattern', () => {
    assert.equal(patternProblem(''), 'pattern must not be empty');
  });

  it('rejects an over long pattern', () => {
    assert.equal(patternProblem('a'.repeat(201)), 'pattern must not exceed 200 characters');
  });

  it('rejects control characters and unsupported glob syntax', () => {
    assert.equal(patternProblem('local\u0000*'), 'pattern must not contain control characters');
    assert.equal(patternProblem('local/[a-z]*'), 'pattern supports only the * and ? wildcards');
    assert.equal(patternProblem('local/{a,b}'), 'pattern supports only the * and ? wildcards');
    assert.equal(patternProblem('local\\*'), 'pattern supports only the * and ? wildcards');
  });
});

describe('matchPattern', () => {
  it('matches a literal pattern exactly', () => {
    assert.equal(matchPattern('local/qwen2.5:7b', 'local/qwen2.5:7b'), true);
    assert.equal(matchPattern('local/qwen2.5:7b', 'local/qwen2.5:7b-instruct'), false);
  });

  it('matches any suffix with * and one character with ?', () => {
    assert.equal(matchPattern('local/*', 'local/qwen2.5:7b'), true);
    assert.equal(matchPattern('local/qwen?.5:7b', 'local/qwen2.5:7b'), true);
    assert.equal(matchPattern('local/qwen?:7b', 'local/qwen2.5:7b'), false);
    assert.equal(matchPattern('*/qwen2.5:7b', 'local/qwen2.5:7b'), true);
  });

  it('is case insensitive and treats other characters literally', () => {
    assert.equal(matchPattern('LOCAL/*', 'local/qwen2.5:7b'), true);
    assert.equal(matchPattern('local/qwen2.5:7b', 'LOCAL/QWEN2.5:7B'), true);
    assert.equal(matchPattern('local/a+b', 'local/a+b'), true);
    assert.equal(matchPattern('local/a+b', 'local/aab'), false);
  });
});

describe('evaluateExposure', () => {
  it('denies by default', () => {
    assert.equal(evaluateExposure([], target), false);
    assert.equal(evaluateExposure([rule({ pattern: 'other/*' })], target), false);
  });

  it('exposes when an allow rule matches', () => {
    assert.equal(evaluateExposure([rule({ pattern: 'local/*' })], target), true);
  });

  it('lets a matching deny win over a matching allow', () => {
    const rules = [rule({ id: 'allow', pattern: 'local/*' }), rule({ id: 'deny', pattern: 'local/qwen*', effect: 'deny' })];

    assert.equal(evaluateExposure(rules, target), false);
    assert.equal(evaluateExposure([...rules].reverse(), target), false);
  });

  it('applies a credential scoped rule only to its own credential', () => {
    const scoped = rule({ credentialId: 'other-credential' });

    assert.equal(evaluateExposure([scoped], target), false);
    assert.equal(evaluateExposure([rule({ credentialId })], target), true);
  });

  it('is order independent', () => {
    const rules = [
      rule({ id: 'deny', pattern: '*', effect: 'deny' }),
      rule({ id: 'allow-global', pattern: 'local/*' }),
      rule({ id: 'allow-scoped', credentialId, pattern: 'local/qwen*' }),
      rule({ id: 'other', pattern: 'work/*' }),
    ];
    const permutations: PolicyRule[][] = [
      rules,
      [...rules].reverse(),
      [rules[3]!, rules[0]!, rules[2]!, rules[1]!],
      [rules[1]!, rules[2]!, rules[3]!, rules[0]!],
    ];

    for (const permutation of permutations) {
      assert.equal(evaluateExposure(permutation, target), false);
    }

    assert.equal(evaluateExposure(rules.slice(1), target), true);
  });
});

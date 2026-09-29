import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import type { PolicyEffect, PolicyRule, PolicyRuleInput } from '../../types/policy.js';
import { CredentialNotFoundError, InvalidPolicyRuleError, PolicyNotFoundError } from '../errors.js';
import { patternProblem } from './policy.js';

const EFFECTS: readonly PolicyEffect[] = ['allow', 'deny'];

@Injectable()
export class PolicyService {
  constructor(
    @Inject(PoliciesRepository) private readonly policies: PoliciesRepository,
    @Inject(CredentialsRepository) private readonly credentials: CredentialsRepository,
  ) {}

  list(): PolicyRule[] {
    return this.policies.list();
  }

  create(input: PolicyRuleInput): PolicyRule {
    const problem = patternProblem(input.pattern);

    if (problem !== null) {
      throw new InvalidPolicyRuleError(problem);
    }

    if (!EFFECTS.includes(input.effect)) {
      throw new InvalidPolicyRuleError('effect must be allow or deny');
    }

    const credentialId = input.credentialId ?? null;

    if (credentialId !== null && this.credentials.findById(credentialId) === undefined) {
      throw new CredentialNotFoundError(credentialId);
    }

    const rule: PolicyRule = {
      id: randomUUID(),
      credentialId,
      pattern: input.pattern,
      effect: input.effect,
      createdAt: Date.now(),
    };

    this.policies.insert(rule);

    return rule;
  }

  delete(id: string): void {
    if (!this.policies.deleteById(id)) {
      throw new PolicyNotFoundError(id);
    }
  }
}

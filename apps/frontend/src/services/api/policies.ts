import type { PolicyRule, PolicyRuleInput } from '../../types/api';
import { requestJson } from './client';

const RESOURCE = '/api/policies';

/** `POST /api/policies`. Creates one allow or deny rule; the caller owns the rule semantics. */
export function createPolicyRule(input: PolicyRuleInput): Promise<PolicyRule> {
  return requestJson<PolicyRule>(RESOURCE, { method: 'POST', body: input });
}

export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRuleInput {
  /** `null` or omitted means a global rule that applies to every credential. */
  readonly credentialId?: string | null;
  /** Glob over the namespaced model id. Only `*` and `?` are supported. */
  readonly pattern: string;
  readonly effect: PolicyEffect;
}

export interface PolicyRule {
  readonly id: string;
  readonly credentialId: string | null;
  readonly pattern: string;
  readonly effect: PolicyEffect;
  readonly createdAt: number;
}

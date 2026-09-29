export type DomainErrorCode =
  | 'invalid_input'
  | 'namespace_taken'
  | 'auth_kind_unsupported'
  | 'unsupported_provider'
  | 'credential_not_found'
  | 'policy_not_found'
  | 'invalid_policy_rule';

/**
 * Business failure. It carries a stable `code`; the HTTP status is a gateway concern, so bll never
 * imports HTTP types.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class InvalidInputError extends DomainError {
  constructor(message: string) {
    super('invalid_input', message);
  }
}

export class NamespaceTakenError extends DomainError {
  constructor(namespace: string) {
    super('namespace_taken', `namespace already taken: ${namespace}`);
  }
}

export class AuthKindUnsupportedError extends DomainError {
  constructor(authKind: string) {
    super('auth_kind_unsupported', `auth kind is not storable yet: ${authKind}`);
  }
}

export class UnsupportedProviderError extends DomainError {
  constructor(providerId: string) {
    super('unsupported_provider', `no adapter registered for provider: ${providerId}`);
  }
}

export class CredentialNotFoundError extends DomainError {
  constructor(credentialId: string) {
    super('credential_not_found', `unknown credential: ${credentialId}`);
  }
}

export class PolicyNotFoundError extends DomainError {
  constructor(policyId: string) {
    super('policy_not_found', `unknown policy: ${policyId}`);
  }
}

export class InvalidPolicyRuleError extends DomainError {
  constructor(message: string) {
    super('invalid_policy_rule', message);
  }
}

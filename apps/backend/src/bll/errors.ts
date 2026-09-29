export type DomainErrorCode =
  | 'invalid_input'
  | 'namespace_taken'
  | 'auth_kind_unsupported'
  | 'unsupported_provider'
  | 'credential_not_found'
  | 'secret_not_found'
  | 'secret_undecryptable'
  | 'secret_key_unavailable'
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
  constructor(authKind: string, providerId?: string) {
    super(
      'auth_kind_unsupported',
      providerId === undefined
        ? `auth kind is not storable: ${authKind}`
        : `provider does not accept the auth kind of this credential: ${providerId} takes ${authKind}`,
    );
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

/** The credential declares `api_key` but no encrypted secret was ever stored for it. */
export class SecretNotFoundError extends DomainError {
  constructor(credentialId: string) {
    super('secret_not_found', `the credential holds no secret: ${credentialId}`);
  }
}

/**
 * The stored ciphertext, IV, tag or version does not match the key: a wrong pepper, a tampered row
 * or a secret written by another installation. It is a credential problem, never a crash, and it
 * never returns partial plaintext.
 */
export class SecretUndecryptableError extends DomainError {
  constructor() {
    super(
      'secret_undecryptable',
      'the stored secret could not be decrypted: the pepper does not match this database or the stored data was altered',
    );
  }
}

/** No pepper at boot, but a secret is being read or written. */
export class SecretKeyUnavailableError extends DomainError {
  constructor() {
    super(
      'secret_key_unavailable',
      'the credential secret key is unavailable: KR_SECRET_PEPPER is missing from the environment',
    );
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

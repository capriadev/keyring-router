import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SECRET_KEY_SOURCE, type SecretKeySource } from '../../config/secret-key-source.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { NAMESPACE_PATTERN, type Credential, type CredentialInput, type StoredSecret } from '../../types/credential.js';
import { STORABLE_AUTH_KINDS, type AdapterTarget, type ValidationResult } from '../../types/provider.js';
import { AuthKindUnsupportedError, CredentialNotFoundError, InvalidInputError, NamespaceTakenError } from '../errors.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { adapterTargetFor } from './adapter-target.js';
import { assertSecretTravelsInHeader, nextSecretVersion, requireSecretKey, sealSecret } from './secrets.js';

/** Rejects anything the adapter could not use and stores the URL without a trailing slash. */
function normalizeBaseUrl(raw: string): string {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidInputError('baseUrl must be an absolute URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidInputError(`baseUrl must use http or https, received ${url.protocol}`);
  }

  if (url.search !== '' || url.hash !== '') {
    throw new InvalidInputError('baseUrl must not carry a query string or a fragment');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

@Injectable()
export class CredentialService {
  constructor(
    @Inject(CredentialsRepository) private readonly credentials: CredentialsRepository,
    @Inject(ProviderRegistry) private readonly registry: ProviderRegistry,
    @Inject(SECRET_KEY_SOURCE) private readonly keySource: SecretKeySource,
  ) {}

  create(input: CredentialInput): Credential {
    if (!NAMESPACE_PATTERN.test(input.namespace)) {
      throw new InvalidInputError('namespace must be 2 to 32 lowercase characters, starting with a letter or digit');
    }

    if (!STORABLE_AUTH_KINDS.includes(input.authKind)) {
      throw new AuthKindUnsupportedError(input.authKind, STORABLE_AUTH_KINDS);
    }

    if (this.credentials.findByNamespace(input.namespace) !== undefined) {
      throw new NamespaceTakenError(input.namespace);
    }

    const adapter = this.registry.get(input.providerId);

    if (!adapter.authKinds.includes(input.authKind)) {
      throw new AuthKindUnsupportedError(input.authKind, adapter.authKinds, input.providerId);
    }

    // Refused instead of dropped in either direction: a secret for `none` is a mistake, and `api_key`
    // without one would store a credential that can never authenticate.
    if (input.authKind === 'none' && input.secret !== undefined) {
      throw new InvalidInputError('authKind none takes no secret');
    }

    if (input.authKind === 'api_key' && input.secret === undefined) {
      throw new InvalidInputError('authKind api_key requires a secret');
    }

    // Last of the value checks, so the specific message wins when both apply. A secret that cannot
    // travel in a header is never sealed: storing it would produce a credential that fails every call
    // with a provider failure blaming the provider.
    if (input.secret !== undefined) {
      assertSecretTravelsInHeader(input.secret);
    }

    const persisted: Credential = {
      id: randomUUID(),
      namespace: input.namespace,
      providerId: input.providerId,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      authKind: input.authKind,
      secretHint: null,
      lastValidatedAt: null,
      lastRefreshAt: null,
      lastRefreshError: null,
      createdAt: Date.now(),
    };

    const secret: StoredSecret | null =
      input.secret === undefined
        ? null
        : sealSecret(requireSecretKey(this.keySource), input.secret, nextSecretVersion(null));

    if (secret === null) {
      // One INSERT: a credential row never lands without its secret, and never half of one.
      this.credentials.insert(persisted);

      return persisted;
    }

    const stored: Credential = { ...persisted, secretHint: secret.secretHint };

    this.credentials.insert(stored, secret);

    return stored;
  }

  list(): Credential[] {
    return this.credentials.list();
  }

  /**
   * Replaces the encrypted secret of a credential. The new ciphertext, IV, tag, version and hint
   * land in a single UPDATE, so a failure between them is impossible; the previous ciphertext is
   * gone, and a stale copy of it stops matching the stored version.
   */
  rotateSecret(id: string, secret: string): Credential {
    const credential = this.credentials.findById(id);

    if (credential === undefined) {
      throw new CredentialNotFoundError(id);
    }

    if (credential.authKind === 'none') {
      throw new InvalidInputError('authKind none stores no secret: rotate a credential that has one');
    }

    // Checked before anything is sealed, so a refused rotation leaves the stored secret untouched.
    assertSecretTravelsInHeader(secret);

    const previous = this.credentials.readStoredSecret(id);
    const stored = sealSecret(
      requireSecretKey(this.keySource),
      secret,
      nextSecretVersion(previous?.secretVersion ?? null),
    );

    this.credentials.replaceSecret(id, stored);

    return { ...credential, secretHint: stored.secretHint };
  }

  async validate(id: string): Promise<ValidationResult> {
    const credential = this.credentials.findById(id);

    if (credential === undefined) {
      throw new CredentialNotFoundError(id);
    }

    const target: AdapterTarget = adapterTargetFor(credential, this.credentials, this.keySource);
    const result = await this.registry.get(credential.providerId).validateCredential(target);

    if (result.ok) {
      this.credentials.markValidated(id, result.validatedAt);
    }

    return result;
  }
}

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { NAMESPACE_PATTERN, type Credential, type CredentialInput } from '../../types/credential.js';
import { STORABLE_AUTH_KINDS, type AdapterTarget, type ValidationResult } from '../../types/provider.js';
import { AuthKindUnsupportedError, CredentialNotFoundError, InvalidInputError, NamespaceTakenError } from '../errors.js';
import { ProviderRegistry } from '../providers/provider-registry.js';

/** No storable auth kind carries a secret yet, so the target never holds one. */
export function toAdapterTarget(credential: Credential): AdapterTarget {
  return { baseUrl: credential.baseUrl, authKind: credential.authKind };
}

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
  ) {}

  create(input: CredentialInput): Credential {
    if (!NAMESPACE_PATTERN.test(input.namespace)) {
      throw new InvalidInputError('namespace must be 2 to 32 lowercase characters, starting with a letter or digit');
    }

    if (!STORABLE_AUTH_KINDS.includes(input.authKind)) {
      throw new AuthKindUnsupportedError(input.authKind);
    }

    if (input.secret !== undefined) {
      throw new InvalidInputError('this slice stores no secret: authKind none takes no credentials');
    }

    if (this.credentials.findByNamespace(input.namespace) !== undefined) {
      throw new NamespaceTakenError(input.namespace);
    }

    this.registry.get(input.providerId);

    const credential: Credential = {
      id: randomUUID(),
      namespace: input.namespace,
      providerId: input.providerId,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      authKind: input.authKind,
      lastValidatedAt: null,
      lastRefreshAt: null,
      lastRefreshError: null,
      createdAt: Date.now(),
    };

    this.credentials.insert(credential);

    return credential;
  }

  list(): Credential[] {
    return this.credentials.list();
  }

  async validate(id: string): Promise<ValidationResult> {
    const credential = this.credentials.findById(id);

    if (credential === undefined) {
      throw new CredentialNotFoundError(id);
    }

    const result = await this.registry.get(credential.providerId).validateCredential(toAdapterTarget(credential));

    if (result.ok) {
      this.credentials.markValidated(id, result.validatedAt);
    }

    return result;
  }
}

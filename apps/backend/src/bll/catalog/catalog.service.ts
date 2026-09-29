import { Inject, Injectable } from '@nestjs/common';
import { SECRET_KEY_SOURCE, type SecretKeySource } from '../../config/secret-key-source.js';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { toNamespacedModelId, type CatalogModel, type CatalogRefreshResult, type ExposedModel } from '../../types/catalog.js';
import { ProviderFailure, type AdapterTarget, type DiscoveredModelRecord } from '../../types/provider.js';
import { CredentialNotFoundError } from '../errors.js';
import { adapterTargetFor } from '../credentials/adapter-target.js';
import { redact } from '../credentials/redaction.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { evaluateExposure } from './policy.js';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CredentialsRepository) private readonly credentials: CredentialsRepository,
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(PoliciesRepository) private readonly policies: PoliciesRepository,
    @Inject(ProviderRegistry) private readonly registry: ProviderRegistry,
    @Inject(SECRET_KEY_SOURCE) private readonly keySource: SecretKeySource,
  ) {}

  /** Discovery replaces the derived rows of the credential; a provider failure keeps them. */
  async refresh(credentialId: string): Promise<CatalogRefreshResult> {
    const credential = this.credentials.findById(credentialId);

    if (credential === undefined) {
      throw new CredentialNotFoundError(credentialId);
    }

    const target: AdapterTarget = adapterTargetFor(credential, this.credentials, this.keySource);

    let discovered: DiscoveredModelRecord[];

    try {
      discovered = await this.registry.get(credential.providerId).discoverCatalog(target);
    } catch (error) {
      if (error instanceof ProviderFailure) {
        // Stored and served back through GET /api/credentials, so it passes the redaction module.
        this.credentials.markRefreshFailed(credentialId, redact(error.message));
      }

      throw error;
    }

    const refreshedAt = Date.now();
    this.catalog.replaceForCredential(
      credentialId,
      discovered.map((model) => ({ ...model, discoveredAt: refreshedAt })),
    );
    this.credentials.markRefreshed(credentialId, refreshedAt);

    return {
      credentialId,
      discovered: discovered.length,
      exposed: this.evaluate(discovered, credential.namespace, credentialId),
      refreshedAt,
    };
  }

  /** Discovered models with their exposure decision. Catalog and policy stay separate. */
  listCatalog(credentialId?: string): CatalogModel[] {
    if (credentialId !== undefined && this.credentials.findById(credentialId) === undefined) {
      throw new CredentialNotFoundError(credentialId);
    }

    const rows = credentialId === undefined ? this.catalog.list() : this.catalog.listByCredential(credentialId);
    const scope = new Map(this.credentials.list().map((credential) => [credential.id, credential]));
    const rules = this.policies.list();

    return rows.map((row) => {
      const credential = scope.get(row.credentialId);

      if (credential === undefined) {
        throw new Error(`catalog row without credential: ${row.id}`);
      }

      const namespacedId = toNamespacedModelId(credential.namespace, row.providerModelId);

      return {
        credentialId: row.credentialId,
        namespace: credential.namespace,
        providerId: credential.providerId,
        providerModelId: row.providerModelId,
        namespacedId,
        displayName: row.displayName,
        sizeBytes: row.sizeBytes,
        family: row.family,
        providerModifiedAt: row.providerModifiedAt,
        discoveredAt: row.discoveredAt,
        exposed: evaluateExposure(rules, { credentialId: row.credentialId, namespacedId }),
      };
    });
  }

  /** Policy-passing models only. This is the single listing a client is served. */
  listExposed(): ExposedModel[] {
    return this.listCatalog()
      .filter((model) => model.exposed)
      .map((model) => ({
        namespacedId: model.namespacedId,
        providerId: model.providerId,
        namespace: model.namespace,
        providerModelId: model.providerModelId,
        displayName: model.displayName,
      }));
  }

  private evaluate(models: readonly DiscoveredModelRecord[], namespace: string, credentialId: string): number {
    const rules = this.policies.list();

    return models.filter((model) =>
      evaluateExposure(rules, {
        credentialId,
        namespacedId: toNamespacedModelId(namespace, model.providerModelId),
      }),
    ).length;
  }
}

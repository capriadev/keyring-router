import { Module } from '@nestjs/common';
import { DalModule } from '../dal/dal.module.js';
import { OllamaAdapter } from '../integrations/providers/ollama/ollama.adapter.js';
import { CatalogService } from './catalog/catalog.service.js';
import { PolicyService } from './catalog/policy.service.js';
import { CredentialService } from './credentials/credential.service.js';
import { PROVIDER_ADAPTERS, ProviderRegistry } from './providers/provider-registry.js';

/**
 * All Keyring Router business logic. The adapter set is composed here, so no other layer imports
 * provider details: consumers resolve adapters through `ProviderRegistry`.
 */
@Module({
  imports: [DalModule],
  providers: [
    { provide: PROVIDER_ADAPTERS, useFactory: () => [new OllamaAdapter()] },
    ProviderRegistry,
    CredentialService,
    CatalogService,
    PolicyService,
  ],
  exports: [ProviderRegistry, CredentialService, CatalogService, PolicyService],
})
export class BllModule {}

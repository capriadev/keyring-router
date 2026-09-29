import { Module } from '@nestjs/common';
import { DalModule } from '../dal/dal.module.js';
import { createProtocolAdapters } from '../integrations/providers/protocol-adapters.js';
import { CatalogService } from './catalog/catalog.service.js';
import { PolicyService } from './catalog/policy.service.js';
import { CredentialService } from './credentials/credential.service.js';
import { PROVIDER_ADAPTERS, ProviderRegistry } from './providers/provider-registry.js';

/**
 * All Keyring Router business logic. The protocol adapter set is composed here, so no other layer imports
 * provider details: consumers resolve adapters through `ProviderRegistry`, which matches a provider to its
 * adapter by the catalog `format`.
 */
@Module({
  imports: [DalModule],
  providers: [
    { provide: PROVIDER_ADAPTERS, useFactory: () => createProtocolAdapters() },
    ProviderRegistry,
    CredentialService,
    CatalogService,
    PolicyService,
  ],
  exports: [ProviderRegistry, CredentialService, CatalogService, PolicyService],
})
export class BllModule {}

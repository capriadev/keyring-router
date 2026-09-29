import { Controller, Get, Inject } from '@nestjs/common';
import { ProviderRegistry } from '../../bll/providers/provider-registry.js';
import type { ProviderDescriptor } from '../../types/api.js';

@Controller('api/providers')
export class ProvidersController {
  constructor(@Inject(ProviderRegistry) private readonly registry: ProviderRegistry) {}

  @Get()
  list(): ProviderDescriptor[] {
    return this.registry.list().map((adapter) => ({ providerId: adapter.id, authKinds: adapter.authKinds }));
  }
}

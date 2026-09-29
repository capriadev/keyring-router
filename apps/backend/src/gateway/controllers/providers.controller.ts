import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ProviderRegistry } from '../../bll/providers/provider-registry.js';
import {
  listProviderDescriptors,
  readProviderDescriptor,
} from '../../bll/providers/provider-directory.js';
import type { ProviderDescriptor, ProviderDetailResponse } from '../../types/api.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';
import { idParamsSchema, type IdParams } from '../schemas.js';

/**
 * The provider catalog as a client sees it: which providers exist, what a credential for one may store and
 * which models the entry declares. No credential is read here, so no response carries a secret and none of
 * them is the catalog discovered for a credential.
 */
@Controller('api/providers')
export class ProvidersController {
  constructor(@Inject(ProviderRegistry) private readonly registry: ProviderRegistry) {}

  @Get()
  list(): ProviderDescriptor[] {
    return [...listProviderDescriptors(this.registry)];
  }

  @Get(':id')
  detail(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParams): ProviderDetailResponse {
    return readProviderDescriptor(this.registry, params.id);
  }
}

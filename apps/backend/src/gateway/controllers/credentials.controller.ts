import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { CatalogService } from '../../bll/catalog/catalog.service.js';
import { CredentialService } from '../../bll/credentials/credential.service.js';
import type { CatalogRefreshResult } from '../../types/catalog.js';
import type { Credential } from '../../types/credential.js';
import type { ValidationResult } from '../../types/provider.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';
import { createCredentialBodySchema, idParamsSchema, type CreateCredentialBody, type IdParams } from '../schemas.js';

@Controller('api/credentials')
export class CredentialsController {
  constructor(
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  @Get()
  list(): Credential[] {
    return this.credentials.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCredentialBodySchema)) body: CreateCredentialBody): Credential {
    return this.credentials.create(body);
  }

  @Post(':id/validate')
  @HttpCode(200)
  async validate(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParams): Promise<ValidationResult> {
    return this.credentials.validate(params.id);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  async refresh(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParams): Promise<CatalogRefreshResult> {
    return this.catalog.refresh(params.id);
  }
}

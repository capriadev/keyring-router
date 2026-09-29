import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CatalogService } from '../../bll/catalog/catalog.service.js';
import type { CatalogModel } from '../../types/catalog.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';
import { catalogQuerySchema, type CatalogQuery } from '../schemas.js';

@Controller('api/catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  list(@Query(new ZodValidationPipe(catalogQuerySchema)) query: CatalogQuery): CatalogModel[] {
    return this.catalog.listCatalog(query.credentialId);
  }
}

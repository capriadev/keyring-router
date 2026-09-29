import { Controller, Get, Inject } from '@nestjs/common';
import { CatalogService } from '../../bll/catalog/catalog.service.js';
import type { ExposedModel } from '../../types/catalog.js';

@Controller('api/models')
export class ModelsController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  list(): ExposedModel[] {
    return this.catalog.listExposed();
  }
}

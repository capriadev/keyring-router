import { Controller, Get, Inject } from '@nestjs/common';
import { CatalogService } from '../../bll/catalog/catalog.service.js';
import type { OpenAiModelListResponse } from '../../types/api.js';
import { openAiModelList } from '../v1-openai.js';

/**
 * `GET /v1/models`: the OpenAI projection of the same policy filtered listing `/api/models` serves. It
 * reads that one listing, so this endpoint cannot serve a set of its own and policy is evaluated exactly
 * once per request.
 */
@Controller('v1/models')
export class V1ModelsController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  list(): OpenAiModelListResponse {
    return openAiModelList(this.catalog.listExposed());
  }
}

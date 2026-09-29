import { Module } from '@nestjs/common';
import { BllModule } from '../bll/bll.module.js';
import { CatalogController } from './controllers/catalog.controller.js';
import { CredentialsController } from './controllers/credentials.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { ModelsController } from './controllers/models.controller.js';
import { PoliciesController } from './controllers/policies.controller.js';
import { ProvidersController } from './controllers/providers.controller.js';

/** The `/api` surface. Controllers validate, call bll and shape the response: no business logic. */
@Module({
  imports: [BllModule],
  controllers: [
    HealthController,
    ProvidersController,
    CredentialsController,
    CatalogController,
    ModelsController,
    PoliciesController,
  ],
})
export class GatewayModule {}

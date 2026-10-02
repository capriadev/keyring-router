import { Module } from '@nestjs/common';
import { BllModule } from '../bll/bll.module.js';
import { RoutingModule } from '../bll/routing/routing.module.js';
import { CatalogController } from './controllers/catalog.controller.js';
import { CredentialsController } from './controllers/credentials.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { ModelsController } from './controllers/models.controller.js';
import { PoliciesController } from './controllers/policies.controller.js';
import { ProvidersController } from './controllers/providers.controller.js';
import { RoutingController } from './controllers/routing.controller.js';
import { RoutingProfilesController } from './controllers/routing-profiles.controller.js';
import { V1ChatController } from './controllers/v1-chat.controller.js';
import { V1ModelsController } from './controllers/v1-models.controller.js';

/**
 * The HTTP surface: `/api` for the local administration interface and `/v1` for the client a user points
 * at their tools. Controllers validate, call bll and shape the answer: no business logic lives here.
 */
@Module({
  imports: [BllModule, RoutingModule],
  controllers: [
    HealthController,
    ProvidersController,
    CredentialsController,
    CatalogController,
    ModelsController,
    PoliciesController,
    RoutingController,
    RoutingProfilesController,
    V1ModelsController,
    V1ChatController,
  ],
})
export class GatewayModule {}

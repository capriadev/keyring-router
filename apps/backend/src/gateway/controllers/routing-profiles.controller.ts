import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import type { RoutingProfile, RoutingProfilesResponse } from '@keyring-router/contracts';
import { RoutingProfilesService } from '../../bll/routing/profiles.service.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';
import {
  createRoutingProfileBodySchema,
  idParamsSchema,
  type CreateRoutingProfileBody,
  type IdParams,
} from '../schemas.js';

/**
 * The routing profiles: the mode and the cascade that apply to each model. It holds no rule of its own,
 * and a profile names models and modes, never a secret.
 */
@Controller('api/routing/profiles')
export class RoutingProfilesController {
  constructor(@Inject(RoutingProfilesService) private readonly profiles: RoutingProfilesService) {}

  @Get()
  list(): RoutingProfilesResponse {
    return this.profiles.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRoutingProfileBodySchema)) body: CreateRoutingProfileBody): RoutingProfile {
    return this.profiles.create(body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParams): void {
    this.profiles.delete(params.id);
  }
}
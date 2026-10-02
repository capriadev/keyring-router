import { Controller, Get, Inject } from '@nestjs/common';
import type { RoutingStateResponse } from '@keyring-router/contracts';
import { RoutingStateService } from '../../bll/routing/state.service.js';

/**
 * The routing state as an operator reads it: which credentials are out of service and why, so a
 * surprising fallback can be explained instead of guessed. It exposes no secret and no request body.
 */
@Controller('api/routing')
export class RoutingController {
  constructor(@Inject(RoutingStateService) private readonly routing: RoutingStateService) {}

  @Get('state')
  state(): RoutingStateResponse {
    return this.routing.snapshot();
  }
}
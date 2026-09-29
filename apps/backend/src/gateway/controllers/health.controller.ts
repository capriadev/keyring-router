import { Controller, Get } from '@nestjs/common';
import { readBackendVersion } from '../../config/version.js';
import type { HealthResponse } from '../../types/api.js';

@Controller('api/health')
export class HealthController {
  @Get()
  get(): HealthResponse {
    return {
      status: 'ok',
      version: readBackendVersion(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}

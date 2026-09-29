import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { PolicyService } from '../../bll/catalog/policy.service.js';
import type { PolicyRule } from '../../types/policy.js';
import { ZodValidationPipe } from '../zod-validation.pipe.js';
import { createPolicyBodySchema, idParamsSchema, type CreatePolicyBody, type IdParams } from '../schemas.js';

@Controller('api/policies')
export class PoliciesController {
  constructor(@Inject(PolicyService) private readonly policies: PolicyService) {}

  @Get()
  list(): PolicyRule[] {
    return this.policies.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPolicyBodySchema)) body: CreatePolicyBody): PolicyRule {
    return this.policies.create(body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParams): void {
    this.policies.delete(params.id);
  }
}

import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { InvalidBodyError } from './api-errors.js';

/** Validates one HTTP boundary with zod and turns a failure into the shape every 400 uses. */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
        .join('; ');

      throw new InvalidBodyError(detail);
    }

    return parsed.data;
  }
}

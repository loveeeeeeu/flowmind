import { type ValidationError, ValidationPipe } from '@nestjs/common';
import { apiError } from './api-error.js';

/** ValidationPipe whose 400s carry `code: VALIDATION_FAILED` like every other API error. */
export class ApiValidationPipe extends ValidationPipe {
  override createExceptionFactory() {
    return (validationErrors: ValidationError[] = []) =>
      apiError.badRequest(
        'VALIDATION_FAILED',
        this.flattenValidationErrors(validationErrors).join('; '),
      );
  }
}

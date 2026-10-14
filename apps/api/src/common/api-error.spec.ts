import { BadRequestException, ConflictException, type HttpException } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { apiError } from './api-error.js';
import { ApiValidationPipe } from './api-validation.pipe.js';

describe('apiError', () => {
  it('keeps the Nest exception class and status, and puts code into the response body', () => {
    const error = apiError.conflict('DRAFT_CHANGED_DURING_PUBLISH', 'Draft changed');

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe('Draft changed');
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      code: 'DRAFT_CHANGED_DURING_PUBLISH',
      message: 'Draft changed',
    });
  });

  it.each([
    [apiError.badRequest('WORKFLOW_ARCHIVED', 'm'), 400],
    [apiError.unauthorized('INVALID_API_KEY', 'm'), 401],
    [apiError.forbidden('API_KEY_FORBIDDEN', 'm'), 403],
    [apiError.notFound('RUN_NOT_FOUND', 'm'), 404],
    [apiError.conflict('WORKFLOW_PUBLISH_CONFLICT', 'm'), 409],
  ])('status in the body matches the HTTP status (%#)', (error: HttpException, status) => {
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toMatchObject({ statusCode: status });
  });
});

class InvokeBody {
  @IsObject()
  input!: Record<string, unknown>;
}

describe('ApiValidationPipe', () => {
  const pipe = new ApiValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('reports DTO errors as VALIDATION_FAILED with a single message string', async () => {
    const error = await pipe
      .transform({ input: 'text', canvas: {} }, { type: 'body', metatype: InvokeBody })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'property canvas should not exist; input must be an object',
    });
  });

  it('passes valid bodies through', async () => {
    await expect(
      pipe.transform({ input: { a: 1 } }, { type: 'body', metatype: InvokeBody }),
    ).resolves.toEqual({ input: { a: 1 } });
  });
});

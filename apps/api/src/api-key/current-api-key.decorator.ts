import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ApiKeyRequest, AuthenticatedApiKey } from './api-key.types.js';

/** The key set by ApiKeyGuard; only valid on handlers protected by that guard. */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedApiKey => {
    const apiKey = context.switchToHttp().getRequest<ApiKeyRequest>().apiKey;

    if (!apiKey) {
      throw new Error('CurrentApiKey used on a route without ApiKeyGuard');
    }

    return apiKey;
  },
);

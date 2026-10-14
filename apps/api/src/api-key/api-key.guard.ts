import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { ApiKeyService } from './api-key.service.js';
import type { ApiKeyRequest } from './api-key.types.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Authenticates /api/v1 requests (401 when it fails). Deliberately not global: the editor's
 * internal API has no API keys. Resource ownership (403) is checked in the services.
 * Never logs the token.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const authorization = request.headers.authorization;

    // One code for every failure: callers fix all of them the same way, and the variants must not
    // help probe which keys exist. The message is only a hint for humans.
    if (!authorization) {
      throw apiError.unauthorized('INVALID_API_KEY', 'Missing API key');
    }

    const token = BEARER_PATTERN.exec(authorization)?.[1];

    if (!token) {
      throw apiError.unauthorized('INVALID_API_KEY', 'Invalid authorization header');
    }

    const apiKey = await this.apiKeys.verify(token);

    if (!apiKey) {
      throw apiError.unauthorized('INVALID_API_KEY', 'Invalid API key');
    }

    request.apiKey = apiKey;
    return true;
  }
}

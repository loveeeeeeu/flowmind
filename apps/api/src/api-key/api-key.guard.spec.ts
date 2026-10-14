import type { ExecutionContext } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { ApiKeyGuard } from './api-key.guard.js';
import type { ApiKeyService } from './api-key.service.js';
import type { ApiKeyRequest } from './api-key.types.js';

const apiKey = { id: 'key-1', workflowId: 'workflow-1' };

function setup(authorization: string | undefined, verified: typeof apiKey | null = apiKey) {
  const request = { headers: { authorization }, params: {} } as unknown as ApiKeyRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const apiKeys = { verify: vi.fn(async () => verified) };
  const guard = new ApiKeyGuard(apiKeys as unknown as ApiKeyService);

  return { guard, context, request, apiKeys };
}

describe('ApiKeyGuard', () => {
  it('attaches only the key identity to the request', async () => {
    const { guard, context, request, apiKeys } = setup('Bearer fm_abc_secret');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(apiKeys.verify).toHaveBeenCalledWith('fm_abc_secret');
    expect(request.apiKey).toEqual({ id: 'key-1', workflowId: 'workflow-1' });
  });

  it('accepts the scheme case-insensitively', async () => {
    const { guard, context } = setup('bearer fm_abc_secret');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([
    ['missing header', undefined, 'Missing API key'],
    ['other scheme', 'Basic dXNlcjpwYXNz', 'Invalid authorization header'],
    ['no token', 'Bearer ', 'Invalid authorization header'],
    ['token with spaces', 'Bearer a b', 'Invalid authorization header'],
  ])('returns 401 for %s without verifying', async (_name, header, message) => {
    const { guard, context, apiKeys } = setup(header);

    await expect(guard.canActivate(context)).rejects.toThrow(
      apiError.unauthorized('INVALID_API_KEY', message),
    );
    expect(apiKeys.verify).not.toHaveBeenCalled();
  });

  it('returns 401 for a key that does not verify (wrong, unknown or revoked)', async () => {
    const { guard, context, request } = setup('Bearer fm_wrong', null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      apiError.unauthorized('INVALID_API_KEY', 'Invalid API key'),
    );
    expect(request.apiKey).toBeUndefined();
  });
});

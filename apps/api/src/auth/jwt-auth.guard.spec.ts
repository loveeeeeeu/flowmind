import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function contextFor(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('returns UNAUTHENTICATED before any project guard when the bearer token is absent', async () => {
    const guard = new JwtAuthGuard({ verifyAsync: vi.fn() } as never, {} as never);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    });
  });

  it('maps malformed, tampered, or expired tokens to the same INVALID_TOKEN contract', async () => {
    const jwt = { verifyAsync: vi.fn().mockRejectedValue(new Error('jwt malformed')) };
    const guard = new JwtAuthGuard(jwt as never, {} as never);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer hello' } })),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'INVALID_TOKEN' }),
    });
  });

  it('rejects a validly signed token when its user was deleted', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'deleted-user' }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer valid-but-stale' } })),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'INVALID_TOKEN' }),
    });
  });

  it('attaches only the current public user record to the request', async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'user-1' }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: 'a@example.com', name: 'Alice' }) } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    const request = { headers: { authorization: 'Bearer valid-token' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request).toHaveProperty('user', { id: 'user-1', email: 'a@example.com', name: 'Alice' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, name: true },
    });
  });
});

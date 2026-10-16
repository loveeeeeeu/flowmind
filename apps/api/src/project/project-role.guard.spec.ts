import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectRoleGuard } from './project-role.guard.js';

function contextFor(request: Record<string, unknown>) {
  return {
    getHandler: () => class Handler {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ProjectRoleGuard', () => {
  it('allows every project member when the route has no required role', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new ProjectRoleGuard(reflector as never);

    expect(guard.canActivate(contextFor({ projectMembership: { role: 'VIEWER' } }))).toBe(true);
  });

  it('allows an accepted role without querying the database again', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['OWNER', 'EDITOR']) };
    const guard = new ProjectRoleGuard(reflector as never);

    expect(guard.canActivate(contextFor({ projectMembership: { role: 'EDITOR' } }))).toBe(true);
  });

  it('returns 403 PROJECT_ROLE_FORBIDDEN for a member with insufficient role', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['OWNER', 'EDITOR']) };
    const guard = new ProjectRoleGuard(reflector as never);

    try {
      guard.canActivate(contextFor({ projectMembership: { role: 'VIEWER' } }));
      throw new Error('expected ProjectRoleGuard to reject VIEWER');
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        response: expect.objectContaining({ code: 'PROJECT_ROLE_FORBIDDEN' }),
      });
    }
  });
});

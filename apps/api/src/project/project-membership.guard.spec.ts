import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectMembershipGuard } from './project-membership.guard.js';

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ProjectMembershipGuard', () => {
  it('attaches the membership for the current user and route project', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1', projectId: 'project-a', userId: 'alice', role: 'OWNER',
    });
    const guard = new ProjectMembershipGuard({ projectMember: { findUnique } } as never);
    const request = { user: { id: 'alice', email: 'alice@example.com', name: 'Alice' }, params: { projectId: 'project-a' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'project-a', userId: 'alice' } },
      select: { id: true, projectId: true, userId: true, role: true },
    });
    expect(request).toHaveProperty('projectMembership.role', 'OWNER');
  });

  it('returns indistinguishable 404 when the user is not a member', async () => {
    const guard = new ProjectMembershipGuard({
      projectMember: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);
    const request = { user: { id: 'alice', email: 'alice@example.com', name: 'Alice' }, params: { projectId: 'bob-project' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ code: 'PROJECT_NOT_FOUND' }),
    });
  });
});

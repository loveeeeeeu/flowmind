import { describe, expect, it, vi } from 'vitest';
import { ProjectMemberService } from './project-member.service.js';

function prismaFor(projectMember: Record<string, ReturnType<typeof vi.fn>>, user = { findUnique: vi.fn() }) {
  const tx = { projectMember };
  return {
    user,
    projectMember,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
}

describe('ProjectMemberService', () => {
  it('normalizes email and adds an existing user once', async () => {
    const projectMember = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'member-2', role: 'EDITOR' }),
    };
    const user = { findUnique: vi.fn().mockResolvedValue({ id: 'user-2', email: 'bob@example.com', name: 'Bob' }) };
    const prisma = prismaFor(projectMember, user);
    const service = new ProjectMemberService(prisma as never);

    await expect(service.addMember('project-1', { email: ' Bob@Example.com ', role: 'EDITOR' })).resolves.toMatchObject({
      id: 'member-2',
      role: 'EDITOR',
    });
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { email: 'bob@example.com' },
      select: { id: true, email: true, name: true },
    });
  });

  it('rejects an unknown user and a duplicate membership with stable errors', async () => {
    const unknownPrisma = prismaFor({ findUnique: vi.fn() }, { findUnique: vi.fn().mockResolvedValue(null) });
    const unknownService = new ProjectMemberService(unknownPrisma as never);
    await expect(unknownService.addMember('project-1', { email: 'missing@example.com', role: 'VIEWER' })).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
    });

    const duplicatePrisma = prismaFor(
      { findUnique: vi.fn().mockResolvedValue({ id: 'member-1' }) },
      { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: 'alice@example.com', name: 'Alice' }) },
    );
    const duplicateService = new ProjectMemberService(duplicatePrisma as never);
    await expect(duplicateService.addMember('project-1', { email: 'alice@example.com', role: 'VIEWER' })).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PROJECT_MEMBER_ALREADY_EXISTS' }),
    });
  });

  it('does not allow the final OWNER to be demoted or removed', async () => {
    const projectMember = {
      findFirst: vi.fn().mockResolvedValue({ id: 'member-owner', role: 'OWNER' }),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const service = new ProjectMemberService(prismaFor(projectMember) as never);

    await expect(service.updateRole('project-1', 'member-owner', { role: 'VIEWER' })).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: 'LAST_PROJECT_OWNER' }),
    });
    await expect(service.removeMember('project-1', 'member-owner')).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: 'LAST_PROJECT_OWNER' }),
    });
    expect(projectMember.update).not.toHaveBeenCalled();
    expect(projectMember.delete).not.toHaveBeenCalled();
  });

  it('updates or removes a member only within the current project', async () => {
    const projectMember = {
      findFirst: vi.fn().mockResolvedValue({ id: 'member-editor', role: 'EDITOR' }),
      count: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'member-editor', role: 'VIEWER' }),
      delete: vi.fn().mockResolvedValue({ id: 'member-editor' }),
    };
    const service = new ProjectMemberService(prismaFor(projectMember) as never);

    await expect(service.updateRole('project-1', 'member-editor', { role: 'VIEWER' })).resolves.toMatchObject({ role: 'VIEWER' });
    await expect(service.removeMember('project-1', 'member-editor')).resolves.toEqual({ success: true });
    expect(projectMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-editor', projectId: 'project-1' },
      select: { id: true, role: true },
    });
  });
});

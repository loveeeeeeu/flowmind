import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { apiError } from '../common/api-error.js';
import { AddProjectMemberDto } from './dto/add-project-member.dto.js';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto.js';

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, email: true, name: true } },
} as const;

@Injectable()
export class ProjectMemberService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: memberSelect,
    });
  }

  async addMember(projectId: string, dto: AddProjectMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw apiError.notFound('USER_NOT_FOUND', 'User not found');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      throw apiError.conflict('PROJECT_MEMBER_ALREADY_EXISTS', 'User is already a project member');
    }

    try {
      return await this.prisma.projectMember.create({
        data: { projectId, userId: user.id, role: dto.role },
        select: memberSelect,
      });
    } catch (error) {
      // The pre-check gives a friendly normal-path error; the composite unique index closes the
      // small race where two OWNER requests add the same user at the same instant.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw apiError.conflict('PROJECT_MEMBER_ALREADY_EXISTS', 'User is already a project member');
      }
      throw error;
    }
  }

  updateRole(projectId: string, memberId: string, dto: UpdateProjectMemberRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId },
        select: { id: true, role: true },
      });
      if (!member) {
        throw apiError.notFound('PROJECT_MEMBER_NOT_FOUND', 'Project member not found');
      }

      if (member.role === 'OWNER' && dto.role !== 'OWNER') {
        await this.assertProjectHasAnotherOwner(tx, projectId);
      }

      return tx.projectMember.update({
        where: { id: member.id },
        data: { role: dto.role },
        select: memberSelect,
      });
    });
  }

  removeMember(projectId: string, memberId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId },
        select: { id: true, role: true },
      });
      if (!member) {
        throw apiError.notFound('PROJECT_MEMBER_NOT_FOUND', 'Project member not found');
      }

      if (member.role === 'OWNER') {
        await this.assertProjectHasAnotherOwner(tx, projectId);
      }

      await tx.projectMember.delete({ where: { id: member.id } });
      return { success: true };
    });
  }

  private async assertProjectHasAnotherOwner(
    tx: Pick<PrismaService, 'projectMember'>,
    projectId: string,
  ) {
    const ownerCount = await tx.projectMember.count({ where: { projectId, role: 'OWNER' } });
    if (ownerCount <= 1) {
      throw apiError.badRequest('LAST_PROJECT_OWNER', 'The project must have at least one owner');
    }
  }
}

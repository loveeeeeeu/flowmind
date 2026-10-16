import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AuthenticatedProjectMember } from './project.types.js';

@Injectable()
export class ProjectMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & {
      user?: AuthenticatedUser;
      projectMembership?: AuthenticatedProjectMember;
    }>();
    if (!request.user) {
      throw new Error('ProjectMembershipGuard requires JwtAuthGuard');
    }
    const projectParam = request.params['projectId'];
    const projectId = Array.isArray(projectParam) ? projectParam[0] : projectParam;
    if (!projectId) {
      throw new Error('ProjectMembershipGuard requires a :projectId route param');
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: request.user.id } },
      select: { id: true, projectId: true, userId: true, role: true },
    });
    if (!membership) {
      // Do not reveal whether the project exists to non-members.
      throw apiError.notFound('PROJECT_NOT_FOUND', 'Project not found');
    }

    request.projectMembership = membership;
    return true;
  }
}

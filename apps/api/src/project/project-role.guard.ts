import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '../common/api-error.js';
import { PROJECT_ROLES_KEY } from './project-roles.decorator.js';
import type { AuthenticatedProjectMember } from './project.types.js';
import type { ProjectRole } from '../generated/prisma/client.js';

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(PROJECT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) {
      return true;
    }

    const membership = context.switchToHttp()
      .getRequest<{ projectMembership?: AuthenticatedProjectMember }>().projectMembership;
    if (!membership) {
      throw new Error('ProjectRoleGuard requires ProjectMembershipGuard');
    }
    if (!requiredRoles.includes(membership.role)) {
      throw apiError.forbidden('PROJECT_ROLE_FORBIDDEN', 'You do not have permission to perform this action');
    }
    return true;
  }
}

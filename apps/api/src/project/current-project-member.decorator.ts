import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedProjectMember } from './project.types.js';

export const CurrentProjectMember = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedProjectMember =>
    context.switchToHttp().getRequest<{ projectMembership: AuthenticatedProjectMember }>().projectMembership,
);

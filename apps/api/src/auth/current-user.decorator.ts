import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);

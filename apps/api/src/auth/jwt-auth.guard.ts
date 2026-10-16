import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser, JwtPayload } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw apiError.unauthorized('UNAUTHENTICATED', 'Authentication required');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw apiError.unauthorized('INVALID_TOKEN', 'Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw apiError.unauthorized('INVALID_TOKEN', 'Invalid access token');
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    const [scheme, token, ...rest] = header?.trim().split(/\s+/) ?? [];
    return scheme === 'Bearer' && token && rest.length === 0 ? token : null;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Sprint 10 transitional bridge: returns the hard-coded development user.
 * Replaced entirely by real JWT auth in Sprint 10 Lesson 2.
 * Do NOT depend on this in production code paths.
 */
@Injectable()
export class CurrentUserService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser() {
    const user = await this.prisma.user.findUnique({
      where: { email: 'dev@flowmind.local' },
    });

    if (!user) {
      throw new Error(
        'Development user is missing. Run: pnpm dlx tsx prisma/bootstrap.ts',
      );
    }

    return user;
  }
}

import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { JwtService } from '@nestjs/jwt';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw apiError.conflict('EMAIL_ALREADY_REGISTERED', 'Email is already registered');
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: dto.name?.trim() || null, passwordHash },
        select: { id: true, email: true, name: true },
      });
      const project = await tx.project.create({
        data: {
          name: 'Personal Workspace',
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
        select: { id: true, name: true },
      });
      return { user, project };
    });

    return { accessToken: await this.issueToken(result.user.id), tokenType: 'Bearer', ...result };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    const valid = await this.passwordHasher.verify(dto.password, user?.passwordHash);
    if (!user || !valid) {
      throw apiError.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    return {
      accessToken: await this.issueToken(user.id),
      tokenType: 'Bearer',
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private issueToken(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}

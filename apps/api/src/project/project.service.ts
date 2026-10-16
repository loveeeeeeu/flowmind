import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { apiError } from '../common/api-error.js';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a project and sets the authenticated user as OWNER.
   */
  async create(userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: { members: { select: { role: true, userId: true } } },
    });
  }

  /**
   * Returns all projects the current user is a member of.
   * GET /projects is intentionally scoped to "mine", not "all".
   */
  async findMine(userId: string) {
    return this.prisma.project.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { workflows: true, credentials: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        members: { some: { userId } },
      },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { workflows: true, credentials: true } },
      },
    });

    if (!project) {
      throw apiError.notFound('PROJECT_NOT_FOUND', `Project ${projectId} not found`);
    }

    return project;
  }
}

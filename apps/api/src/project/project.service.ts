import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUserService } from '../auth/current-user.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { apiError } from '../common/api-error.js';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
  ) {}

  /**
   * Creates a project and sets the calling user as OWNER.
   * After real auth lands (Lesson 2) only the CurrentUserService call changes.
   */
  async create(dto: CreateProjectDto) {
    const user = await this.currentUser.getCurrentUser();

    return this.prisma.project.create({
      data: {
        name: dto.name,
        members: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
      include: { members: { select: { role: true, userId: true } } },
    });
  }

  /**
   * Returns all projects the current user is a member of.
   * GET /projects is intentionally scoped to "mine", not "all".
   */
  async findMine() {
    const user = await this.currentUser.getCurrentUser();

    return this.prisma.project.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { workflows: true, credentials: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(projectId: string) {
    const user = await this.currentUser.getCurrentUser();

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        members: { some: { userId: user.id } },
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

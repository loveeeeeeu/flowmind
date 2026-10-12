import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Read side of immutable workflow versions. Versions are only ever created by publishing
 * (Sprint 8 Lesson 2); there is deliberately no update or delete.
 */
@Injectable()
export class WorkflowVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Summaries only: canvas snapshots can be large and the list does not need them. */
  findByWorkflow(workflowId: string) {
    return this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: { id: true, workflowId: true, version: true, createdAt: true },
    });
  }

  findOne(id: string) {
    return this.prisma.workflowVersion.findUnique({
      where: { id },
    });
  }

  findLatest(workflowId: string) {
    return this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: 'desc' },
    });
  }
}

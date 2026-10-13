import { ConflictException, Injectable } from '@nestjs/common';
import type { WorkflowCanvas } from '@flowmind/workflow-core';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const VERSION_SUMMARY = { id: true, workflowId: true, version: true, createdAt: true } as const;

/**
 * Persistence of immutable workflow versions. Versions are only ever inserted by publish;
 * there is deliberately no update or delete. Validation is the caller's job.
 */
@Injectable()
export class WorkflowVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Short transaction with no external calls: next number, snapshot, status. Two concurrent
   * publishes may compute the same number; @@unique([workflowId, version]) rejects the loser.
   */
  async publish(workflowId: string, canvas: WorkflowCanvas) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.workflowVersion.findFirst({
          where: { workflowId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

        const version = await tx.workflowVersion.create({
          data: {
            workflowId,
            version: (latest?.version ?? 0) + 1,
            canvas: canvas as unknown as Prisma.InputJsonValue,
          },
          select: VERSION_SUMMARY,
        });

        // Stays PUBLISHED on later draft edits: it means "has at least one version".
        await tx.workflow.update({
          where: { id: workflowId },
          data: { status: 'PUBLISHED' },
        });

        return version;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Workflow was published concurrently, please retry');
      }

      throw error;
    }
  }

  /** Summaries only: canvas snapshots can be large and the list does not need them. */
  findByWorkflow(workflowId: string) {
    return this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: VERSION_SUMMARY,
    });
  }

  findOne(id: string) {
    return this.prisma.workflowVersion.findUnique({
      where: { id },
    });
  }

  /** "Latest published" is simply the highest number: every version is a published snapshot. */
  findLatest(workflowId: string) {
    return this.prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { version: 'desc' },
      select: VERSION_SUMMARY,
    });
  }
}

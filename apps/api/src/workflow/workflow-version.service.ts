import { Injectable } from '@nestjs/common';
import type { WorkflowCanvas } from '@flowmind/workflow-core';
import { apiError } from '../common/api-error.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const VERSION_SUMMARY = {
  id: true,
  workflowId: true,
  version: true,
  draftRevision: true,
  createdAt: true,
} as const;

export interface PublishVersionParams {
  workflowId: string;
  /** The canvas the caller validated, and the draft revision it was read at. */
  canvas: WorkflowCanvas;
  expectedDraftRevision: number;
}

/**
 * Persistence of immutable workflow versions. Versions are only ever inserted by publish;
 * there is deliberately no update or delete. Validation is the caller's job.
 */
@Injectable()
export class WorkflowVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Short transaction with no external calls. Validation happened before it, so the revision
   * check guarantees that the canvas being stored is exactly the one that was validated.
   */
  async publishValidatedDraft({ workflowId, canvas, expectedDraftRevision }: PublishVersionParams) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.workflow.findUnique({
          where: { id: workflowId },
          select: { draftRevision: true },
        });

        if (!current) {
          throw apiError.notFound('WORKFLOW_NOT_FOUND', `Workflow ${workflowId} not found`);
        }

        // A save landed between validation and this transaction: its canvas was never validated.
        if (current.draftRevision !== expectedDraftRevision) {
          throw apiError.conflict(
            'DRAFT_CHANGED_DURING_PUBLISH',
            'Workflow draft changed during publish, please retry',
          );
        }

        const latest = await tx.workflowVersion.findFirst({
          where: { workflowId },
          orderBy: { version: 'desc' },
          select: { version: true, draftRevision: true },
        });

        // Also guards API callers and double clicks, not just the disabled button.
        if (latest && latest.draftRevision === expectedDraftRevision) {
          throw apiError.badRequest(
            'WORKFLOW_NO_UNPUBLISHED_CHANGES',
            'Workflow has no unpublished changes',
          );
        }

        const version = await tx.workflowVersion.create({
          data: {
            workflowId,
            version: (latest?.version ?? 0) + 1,
            canvas: canvas as unknown as Prisma.InputJsonValue,
            draftRevision: expectedDraftRevision,
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
      // Two concurrent publishes of the same revision computed the same version number.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw apiError.conflict(
          'WORKFLOW_PUBLISH_CONFLICT',
          'Workflow was published concurrently, please retry',
        );
      }

      throw error;
    }
  }

  /** Metadata only: 50 versions x 100 KB canvases would make the list megabytes. */
  findByWorkflow(workflowId: string) {
    return this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { version: 'desc' },
      take: 50,
      select: VERSION_SUMMARY,
    });
  }

  /** Scoped by workflow so a version id from another workflow is a 404, not a leak. */
  async findOne(workflowId: string, versionId: string) {
    const version = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId },
      select: { ...VERSION_SUMMARY, canvas: true },
    });

    if (!version) {
      throw apiError.notFound(
        'WORKFLOW_VERSION_NOT_FOUND',
        `Workflow version ${versionId} not found`,
      );
    }

    return version;
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

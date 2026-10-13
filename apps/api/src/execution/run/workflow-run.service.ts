import { Injectable } from '@nestjs/common';
import { normalizeExecutionError } from '@flowmind/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';

export interface CreateRunRecordParams {
  workflowId: string;
  /** Required for every new run; the column stays nullable only for legacy rows. */
  workflowVersionId: string;
  input: Record<string, unknown>;
}

@Injectable()
export class WorkflowRunService {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateRunRecordParams) {
    return this.prisma.workflowRun.create({
      data: {
        workflowId: params.workflowId,
        workflowVersionId: params.workflowVersionId,
        status: 'PENDING',
        input: toJsonInput(params.input),
      },
    });
  }

  markFailed(runId: string, error: unknown) {
    const { code, message } = normalizeExecutionError(
      error,
      'EXECUTION_ERROR',
      'Workflow execution failed',
    );

    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }

  findOne(runId: string) {
    return this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        // null for legacy runs created before versioning.
        workflowVersion: { select: { id: true, version: true, createdAt: true } },
        nodeRuns: {
          // Retries share a sequence, so attempt keeps them in execution order.
          orderBy: [{ sequence: 'asc' }, { attempt: 'asc' }],
        },
      },
    });
  }

  /** Kept out of findOne: logs grow much faster than node runs and are loaded on demand. */
  async findLogs(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });

    if (!run) {
      return null;
    }

    return this.prisma.executionLog.findMany({
      where: { workflowRunId: runId },
      // Several logs can share a millisecond; the id keeps the order stable between polls.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }

  findByWorkflow(workflowId: string) {
    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        workflowId: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        // Joined here so the history list never fetches versions one run at a time.
        workflowVersion: { select: { id: true, version: true } },
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { normalizeExecutionError } from '@flowmind/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';

@Injectable()
export class WorkflowRunService {
  constructor(private readonly prisma: PrismaService) {}

  create(workflowId: string, input: Record<string, unknown>) {
    return this.prisma.workflowRun.create({
      data: {
        workflowId,
        status: 'PENDING',
        input: toJsonInput(input),
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
        nodeRuns: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
  }

  findByWorkflow(workflowId: string) {
    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

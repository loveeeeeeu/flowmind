import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ExternalRunResponse } from './dto/external-run-response.dto.js';

/** Only status, result and error: node runs and logs stay internal debugging data. */
@Injectable()
export class ExternalRunService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(runId: string): Promise<ExternalRunResponse> {
    const run = await this.prisma.workflowRun.findFirst({
      // Draft test runs belong to the editor; they don't exist for external callers.
      where: { id: runId, source: 'PUBLISHED' },
      select: {
        id: true,
        workflowId: true,
        status: true,
        output: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        workflowVersion: { select: { version: true } },
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    return {
      runId: run.id,
      workflowId: run.workflowId,
      version: run.workflowVersion?.version ?? null,
      status: run.status,
      output: run.status === 'SUCCESS' ? run.output : null,
      error:
        run.status === 'FAILED'
          ? {
              code: run.errorCode ?? 'EXECUTION_ERROR',
              message: run.errorMessage ?? 'Workflow execution failed',
            }
          : null,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }
}

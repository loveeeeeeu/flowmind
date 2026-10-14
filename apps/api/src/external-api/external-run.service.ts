import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedApiKey } from '../api-key/api-key.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ExternalRunResponse } from './dto/external-run-response.dto.js';

/** Only status, result and error: node runs and logs stay internal debugging data. */
@Injectable()
export class ExternalRunService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(runId: string, apiKey: AuthenticatedApiKey): Promise<ExternalRunResponse> {
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

    // The run id is not a secret: without this, any valid key could read any workflow's output.
    if (run.workflowId !== apiKey.workflowId) {
      throw new ForbiddenException('API key cannot access this run');
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

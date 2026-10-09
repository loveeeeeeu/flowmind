import { Injectable, Logger } from '@nestjs/common';
import { normalizeExecutionError } from '@flowmind/shared';
import { type WorkflowCanvas, WorkflowEngine } from '@flowmind/workflow-core';
import { PrismaService } from '../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';

@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: WorkflowEngine,
  ) {}

  async executeRun(runId: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: { workflow: true },
    });

    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    // Conditional update = atomic claim: a redelivered job cannot run the same run twice.
    const claimed = await this.prisma.workflowRun.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    if (claimed.count === 0) {
      this.logger.warn(`Run ${runId} skipped: status is ${run.status}, expected PENDING`);
      return;
    }

    // Known limitation: reads the workflow's latest canvas; WorkflowVersion snapshots fix this later.
    const canvas = run.workflow.canvas as unknown as WorkflowCanvas;
    const input = (run.input ?? {}) as Record<string, unknown>;

    try {
      const result = await this.engine.execute(canvas, input, {
        observer: new PrismaExecutionObserver(this.prisma, runId),
      });

      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCESS',
          ...(result.result === undefined ? {} : { output: toJsonInput(result.result) }),
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const { code, message } = normalizeExecutionError(
        error,
        'EXECUTION_ERROR',
        'Workflow execution failed',
      );

      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          errorCode: code,
          errorMessage: message,
          finishedAt: new Date(),
        },
      });

      this.logger.warn(`Run ${runId} failed: ${message}`);
      throw error;
    }
  }
}

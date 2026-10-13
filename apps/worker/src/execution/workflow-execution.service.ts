import { Injectable } from '@nestjs/common';
import {
  type WorkflowCanvas,
  WorkflowEngine,
  type WorkflowExecutionResult,
} from '@flowmind/workflow-core';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExecutionLogService } from './execution-log.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';
import { RunStateService } from './run-state.service.js';

export const WORKFLOW_VERSION_MISSING = 'WORKFLOW_VERSION_MISSING';

@Injectable()
export class WorkflowExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: WorkflowEngine,
    private readonly runState: RunStateService,
    private readonly logs: ExecutionLogService,
  ) {}

  async executeRun(runId: string) {
    const run = await this.runState.findRun(runId);

    if ((await this.runState.prepareForExecution(run)) === 'skip') {
      return;
    }

    // Legacy runs predate versioning. Falling back to the draft would execute something the
    // user never published, so they fail explicitly instead.
    if (!run.workflowVersion) {
      const error = Object.assign(
        new Error('Workflow run was created before versioned execution was enabled'),
        { code: WORKFLOW_VERSION_MISSING },
      );
      await this.runState.markFailed(runId, error);
      throw error;
    }

    // Immutable snapshot bound at run creation: later draft edits or publishes cannot leak in.
    // The engine still re-validates it before executing.
    const canvas = run.workflowVersion.canvas as unknown as WorkflowCanvas;
    const input = (run.input ?? {}) as Record<string, unknown>;
    const stopHeartbeat = this.runState.startHeartbeat(runId);
    let result: WorkflowExecutionResult;

    try {
      result = await this.engine.execute(canvas, input, {
        observer: new PrismaExecutionObserver(this.prisma, this.logs, runId),
      });
    } catch (error) {
      await this.runState.markFailed(runId, error);
      throw error;
    } finally {
      stopHeartbeat();
    }

    await this.runState.markSuccess(runId, result.result);
  }
}

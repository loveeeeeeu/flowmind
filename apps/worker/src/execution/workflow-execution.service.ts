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
export const DRAFT_SNAPSHOT_MISSING = 'DRAFT_SNAPSHOT_MISSING';

type LoadedRun = Awaited<ReturnType<RunStateService['findRun']>>;

function runError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

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

    let canvas: WorkflowCanvas;

    try {
      canvas = this.resolveCanvas(run);
    } catch (error) {
      await this.runState.markFailed(runId, error);
      throw error;
    }

    const input = (run.input ?? {}) as Record<string, unknown>;
    const stopHeartbeat = this.runState.startHeartbeat(runId);
    let result: WorkflowExecutionResult;

    try {
      // The engine re-validates the snapshot before executing any node.
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

  /**
   * Both sources are immutable snapshots taken when the run was created, so edits or publishes
   * while the run is queued never change what it executes. A missing snapshot fails the run
   * explicitly; falling back to the live draft would execute something nobody asked for.
   */
  private resolveCanvas(run: LoadedRun): WorkflowCanvas {
    switch (run.source) {
      case 'PUBLISHED':
        if (!run.workflowVersion) {
          // Legacy runs from before versioning end up here.
          throw runError(WORKFLOW_VERSION_MISSING, 'Published run has no workflow version');
        }
        return run.workflowVersion.canvas as unknown as WorkflowCanvas;

      case 'DRAFT':
        if (!run.draftSnapshot) {
          throw runError(DRAFT_SNAPSHOT_MISSING, 'Draft run has no snapshot');
        }
        return run.draftSnapshot as unknown as WorkflowCanvas;

      default:
        throw new Error(`Unsupported run source: ${String(run.source)}`);
    }
  }
}

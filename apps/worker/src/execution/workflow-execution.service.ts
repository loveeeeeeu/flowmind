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
import { resolveRunCanvas } from './resolve-run-canvas.js';

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
      canvas = resolveRunCanvas(run);
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
}

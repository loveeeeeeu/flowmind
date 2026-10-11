import type {
  ExecutionObserver,
  NodeExecutionEvent,
  NodeFailureEvent,
  NodeSuccessEvent,
} from '@flowmind/workflow-core';
import { normalizeExecutionError } from '@flowmind/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';

export class PrismaExecutionObserver implements ExecutionObserver {
  // Keyed by sequence + attempt: a loop body repeats a node across sequences,
  // and a retried node repeats a sequence across attempts.
  private readonly nodeRunIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowRunId: string,
  ) {}

  async onNodeStart({ node, sequence, attempt }: NodeExecutionEvent) {
    const nodeRun = await this.prisma.nodeRun.create({
      data: {
        workflowRunId: this.workflowRunId,
        nodeId: node.id,
        nodeType: node.type,
        sequence,
        attempt,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    this.nodeRunIds.set(this.makeKey(sequence, attempt), nodeRun.id);
  }

  async onNodeSuccess({ sequence, attempt, output }: NodeSuccessEvent) {
    await this.prisma.nodeRun.update({
      where: { id: this.getNodeRunId(sequence, attempt) },
      data: {
        status: 'SUCCESS',
        ...(output === undefined ? {} : { output: toJsonInput(output) }),
        finishedAt: new Date(),
      },
    });
  }

  // An attempt that will be retried is still recorded as FAILED: it did fail, and the next
  // attempt gets its own row. Only the scheduler's final throw fails the WorkflowRun.
  async onNodeFailure({ sequence, attempt, error }: NodeFailureEvent) {
    const { code, message } = normalizeExecutionError(
      error,
      'NODE_EXECUTION_ERROR',
      'Node execution failed',
    );

    await this.prisma.nodeRun.update({
      where: { id: this.getNodeRunId(sequence, attempt) },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }

  private makeKey(sequence: number, attempt: number) {
    return `${sequence}:${attempt}`;
  }

  private getNodeRunId(sequence: number, attempt: number) {
    const id = this.nodeRunIds.get(this.makeKey(sequence, attempt));

    if (!id) {
      throw new Error(`Node run for sequence ${sequence} attempt ${attempt} was not started`);
    }

    return id;
  }
}

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
  // Keyed by sequence, not nodeId: a loop body executes the same node several times.
  private readonly nodeRunIds = new Map<number, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowRunId: string,
  ) {}

  async onNodeStart({ node, sequence }: NodeExecutionEvent) {
    const nodeRun = await this.prisma.nodeRun.create({
      data: {
        workflowRunId: this.workflowRunId,
        nodeId: node.id,
        nodeType: node.type,
        sequence,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    this.nodeRunIds.set(sequence, nodeRun.id);
  }

  async onNodeSuccess({ sequence, output }: NodeSuccessEvent) {
    await this.prisma.nodeRun.update({
      where: { id: this.getNodeRunId(sequence) },
      data: {
        status: 'SUCCESS',
        ...(output === undefined ? {} : { output: toJsonInput(output) }),
        finishedAt: new Date(),
      },
    });
  }

  async onNodeFailure({ sequence, error }: NodeFailureEvent) {
    const { code, message } = normalizeExecutionError(
      error,
      'NODE_EXECUTION_ERROR',
      'Node execution failed',
    );

    await this.prisma.nodeRun.update({
      where: { id: this.getNodeRunId(sequence) },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }

  private getNodeRunId(sequence: number) {
    const id = this.nodeRunIds.get(sequence);

    if (!id) {
      throw new Error(`Node run for sequence ${sequence} was not started`);
    }

    return id;
  }
}

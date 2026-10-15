import {
  type ExecutionObserver,
  isRetryableError,
  type NodeExecutionEvent,
  type NodeFailureEvent,
  type NodeSuccessEvent,
  type WorkflowNode,
} from '@flowmind/workflow-core';
import { normalizeExecutionError } from '@flowmind/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
import { toJsonInput } from './json-value.js';

// Safe, low-volume facts per node type; prompts, URLs and headers may carry user data or secrets.
function describeNode(node: WorkflowNode): Record<string, unknown> {
  switch (node.type) {
    case 'llm':
      return { modelId: node.data.modelId };
    case 'http':
      return { method: node.data.method };
    default:
      return {};
  }
}

/**
 * NodeRun rows are the core trace and must be written (a failure aborts the run);
 * ExecutionLog rows are best-effort observability on top of them.
 */
export class PrismaExecutionObserver implements ExecutionObserver {
  // Keyed by sequence + attempt: a loop body repeats a node across sequences,
  // and a retried node repeats a sequence across attempts.
  private readonly nodeRunIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: ExecutionLogService,
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

    await this.logs.log({
      workflowRunId: this.workflowRunId,
      nodeRunId: nodeRun.id,
      message: '节点开始执行',
      metadata: {
        nodeId: node.id,
        nodeType: node.type,
        sequence,
        attempt,
        ...describeNode(node),
        ...(node.type === 'llm' ? await this.describeModel(node.data.modelId) : {}),
      },
    });
  }

  async onNodeSuccess({ node, sequence, attempt, output }: NodeSuccessEvent) {
    const nodeRunId = this.getNodeRunId(sequence, attempt);

    await this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'SUCCESS',
        ...(output === undefined ? {} : { output: toJsonInput(output) }),
        finishedAt: new Date(),
      },
    });

    await this.logs.log({
      workflowRunId: this.workflowRunId,
      nodeRunId,
      message: '节点执行成功',
      metadata: { nodeId: node.id, sequence, attempt },
    });
  }

  // An attempt that will be retried is still recorded as FAILED: it did fail, and the next
  // attempt gets its own row. Only the scheduler's final throw fails the WorkflowRun.
  async onNodeFailure({ node, sequence, attempt, error, willRetry, retryDelayMs }: NodeFailureEvent) {
    const nodeRunId = this.getNodeRunId(sequence, attempt);
    const { code, message } = normalizeExecutionError(
      error,
      'NODE_EXECUTION_ERROR',
      'Node execution failed',
    );

    await this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });

    await this.logs.log({
      workflowRunId: this.workflowRunId,
      nodeRunId,
      level: willRetry ? 'WARN' : 'ERROR',
      message: willRetry ? `节点执行失败，${retryDelayMs}ms 后重试` : '节点执行失败',
      metadata: {
        nodeId: node.id,
        sequence,
        attempt,
        code,
        retryable: isRetryableError(error),
        willRetry,
        ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
      },
    });
  }

  /**
   * Which model and credential the call will use, for debugging. Selects metadata only, never
   * the secret fields; best-effort like the log itself, so a lookup failure logs nothing extra.
   */
  private async describeModel(modelId: unknown): Promise<Record<string, unknown>> {
    if (typeof modelId !== 'string' || !modelId) {
      return {};
    }

    const model = await this.prisma.model
      .findUnique({
        where: { id: modelId },
        select: { modelName: true, credentialId: true, credential: { select: { provider: true } } },
      })
      .catch(() => null);

    if (!model) {
      return {};
    }

    return {
      modelName: model.modelName,
      provider: model.credential.provider,
      credentialId: model.credentialId,
    };
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

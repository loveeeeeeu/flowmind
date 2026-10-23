import {
  type ExecutionObserver,
  isRetryableError,
  type NodeExecutionEvent,
  type NodeFailureEvent,
  type NodeSuccessEvent,
  type WorkflowNode,
} from '@flowmind/workflow-core';
import { normalizeExecutionError, sanitizeDebugValue } from '@flowmind/shared';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RunEventPublisher } from '../execution-events/run-event-publisher.service.js';
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

/** The debug input is a frozen, sanitised node configuration, never a credential/runtime secret. */
function toSafeNodeDebugInput(node: WorkflowNode) {
  return sanitizeDebugValue({ nodeType: node.type, config: node.data });
}

/**
 * NodeRun rows are the core trace and must be written (a failure aborts the run);
 * ExecutionLog rows are best-effort observability on top of them.
 */
export class PrismaExecutionObserver implements ExecutionObserver {
  // Keyed by sequence + attempt: a loop body repeats a node across sequences,
  // and a retried node repeats a sequence across attempts.
  private readonly nodeRunIds = new Map<string, string>();
  private readonly nodeRunStartedAts = new Map<string, Date>();
  private readonly logger = new Logger(PrismaExecutionObserver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: ExecutionLogService,
    private readonly workflowRunId: string,
    private readonly events?: RunEventPublisher,
  ) {}

  async onNodeStart({ node, sequence, attempt }: NodeExecutionEvent) {
    const startedAt = new Date();
    const nodeRun = await this.prisma.nodeRun.create({
      data: {
        workflowRunId: this.workflowRunId,
        nodeId: node.id,
        nodeType: node.type,
        sequence,
        attempt,
        status: 'RUNNING',
        input: toJsonInput(toSafeNodeDebugInput(node)),
        startedAt,
      },
    });

    const executionKey = this.makeKey(sequence, attempt);
    this.nodeRunIds.set(executionKey, nodeRun.id);
    this.nodeRunStartedAts.set(executionKey, startedAt);

    await this.safePublish({
      eventId: randomUUID(),
      runId: this.workflowRunId,
      type: 'NODE_STATUS_CHANGED',
      timestamp: startedAt.toISOString(),
      nodeRunId: nodeRun.id,
      nodeId: node.id,
      nodeType: node.type,
      sequence,
      attempt,
      status: 'RUNNING',
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      error: null,
    });

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
    return nodeRun.id;
  }

  async onNodeSuccess({ node, sequence, attempt, output }: NodeSuccessEvent) {
    const nodeRunId = this.getNodeRunId(sequence, attempt);
    const finishedAt = new Date();

    await this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'SUCCESS',
        ...(output === undefined ? {} : { output: toJsonInput(output) }),
        finishedAt,
      },
    });

    await this.safePublish({
      eventId: randomUUID(),
      runId: this.workflowRunId,
      type: 'NODE_STATUS_CHANGED',
      timestamp: finishedAt.toISOString(),
      nodeRunId,
      nodeId: node.id,
      nodeType: node.type,
      sequence,
      attempt,
      status: 'SUCCESS',
      startedAt: this.getNodeRunStartedAt(sequence, attempt).toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: null,
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
    const finishedAt = new Date();

    await this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt,
      },
    });

    await this.safePublish({
      eventId: randomUUID(),
      runId: this.workflowRunId,
      type: 'NODE_STATUS_CHANGED',
      timestamp: finishedAt.toISOString(),
      nodeRunId,
      nodeId: node.id,
      nodeType: node.type,
      sequence,
      attempt,
      status: 'FAILED',
      startedAt: this.getNodeRunStartedAt(sequence, attempt).toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: { code, message },
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

  private getNodeRunStartedAt(sequence: number, attempt: number) {
    const startedAt = this.nodeRunStartedAts.get(this.makeKey(sequence, attempt));

    if (!startedAt) {
      throw new Error(`Node run for sequence ${sequence} attempt ${attempt} has no start time`);
    }

    return startedAt;
  }

  /** Redis is a low-latency UI signal. A publish failure must never change an execution fact. */
  private async safePublish(event: Parameters<RunEventPublisher['publish']>[0]) {
    if (!this.events) {
      return;
    }

    try {
      await this.events.publish(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to publish node event for run ${event.runId}: ${message}`);
    }
  }
}

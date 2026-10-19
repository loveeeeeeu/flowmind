import { Injectable } from '@nestjs/common';
import { normalizeExecutionError, sanitizeDebugMetadata, sanitizeDebugValue } from '@flowmind/shared';
import type { WorkflowCanvas } from '@flowmind/workflow-core';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';
import { apiError } from '../../common/api-error.js';

export interface CreatePublishedRunParams {
  workflowId: string;
  workflowVersionId: string;
  /** The key that triggered the run through the external API; absent for editor runs. */
  workflowApiKeyId?: string;
  input: Record<string, unknown>;
}

/** Which key triggered a run, for the editor's history; never the hash. */
const RUN_API_KEY = { select: { id: true, name: true, prefix: true } } as const;

export interface CreateDraftRunParams {
  workflowId: string;
  canvas: WorkflowCanvas;
  input: Record<string, unknown>;
}

/**
 * The two creators are the only writers of new runs, so each run gets exactly one canvas
 * source: a published version or its own draft snapshot, never both.
 */
@Injectable()
export class WorkflowRunService {
  constructor(private readonly prisma: PrismaService) {}

  createPublished(params: CreatePublishedRunParams) {
    return this.prisma.workflowRun.create({
      data: {
        workflowId: params.workflowId,
        source: 'PUBLISHED',
        workflowVersionId: params.workflowVersionId,
        workflowApiKeyId: params.workflowApiKeyId,
        status: 'PENDING',
        input: toJsonInput(params.input),
      },
      omit: { draftSnapshot: true },
    });
  }

  createDraft(params: CreateDraftRunParams) {
    return this.prisma.workflowRun.create({
      data: {
        workflowId: params.workflowId,
        source: 'DRAFT',
        draftSnapshot: params.canvas as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        input: toJsonInput(params.input),
      },
      // The client already has the canvas it sent; don't echo it back.
      omit: { draftSnapshot: true },
    });
  }

  markFailed(runId: string, error: unknown) {
    const { code, message } = normalizeExecutionError(
      error,
      'EXECUTION_ERROR',
      'Workflow execution failed',
    );

    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }

  findOne(projectId: string, runId: string) {
    return this.prisma.workflowRun.findFirst({
      where: { id: runId, workflow: { projectId } },
      // Polled every second while running; the snapshot can be large and the UI doesn't show it yet.
      omit: { draftSnapshot: true },
      include: {
        // null for legacy runs created before versioning.
        workflowVersion: { select: { id: true, version: true, createdAt: true } },
        workflowApiKey: RUN_API_KEY,
        nodeRuns: {
          // Retries share a sequence, so attempt keeps them in execution order.
          orderBy: [{ sequence: 'asc' }, { attempt: 'asc' }],
          // Input/output can be large or sensitive. The Debug API exposes a sanitised projection on demand.
          select: {
            id: true,
            workflowRunId: true,
            nodeId: true,
            nodeType: true,
            status: true,
            sequence: true,
            iteration: true,
            attempt: true,
            errorCode: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async findNodeRunDebug(projectId: string, runId: string, nodeRunId: string) {
    const nodeRun = await this.prisma.nodeRun.findFirst({
      where: {
        id: nodeRunId,
        workflowRunId: runId,
        workflowRun: { workflow: { projectId } },
      },
      select: {
        id: true,
        workflowRunId: true,
        nodeId: true,
        nodeType: true,
        sequence: true,
        attempt: true,
        status: true,
        input: true,
        output: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        logs: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 500,
          select: { id: true, level: true, message: true, metadata: true, createdAt: true },
        },
      },
    });

    if (!nodeRun) {
      throw apiError.notFound('NODE_RUN_NOT_FOUND', 'Node run not found');
    }

    const endedAt = nodeRun.finishedAt ?? new Date();

    return {
      id: nodeRun.id,
      runId: nodeRun.workflowRunId,
      nodeId: nodeRun.nodeId,
      nodeType: nodeRun.nodeType,
      sequence: nodeRun.sequence,
      attempt: nodeRun.attempt,
      status: nodeRun.status,
      startedAt: nodeRun.startedAt,
      finishedAt: nodeRun.finishedAt,
      durationMs: nodeRun.startedAt ? Math.max(0, endedAt.getTime() - nodeRun.startedAt.getTime()) : null,
      input: sanitizeDebugValue(nodeRun.input),
      output: sanitizeDebugValue(nodeRun.output),
      error: nodeRun.errorCode
        ? { code: nodeRun.errorCode, message: nodeRun.errorMessage ?? '' }
        : null,
      logs: nodeRun.logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        metadata: sanitizeDebugMetadata(log.metadata),
        createdAt: log.createdAt,
      })),
    };
  }

  /** Kept out of findOne: logs grow much faster than node runs and are loaded on demand. */
  async findLogs(projectId: string, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, workflow: { projectId } },
      select: { id: true },
    });

    if (!run) {
      return null;
    }

    const logs = await this.prisma.executionLog.findMany({
      where: { workflowRunId: runId },
      // Several logs can share a millisecond; the id keeps the order stable between polls.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });

    return logs.map((log) => ({
      ...log,
      metadata: sanitizeDebugMetadata(log.metadata),
    }));
  }

  findByWorkflow(workflowId: string) {
    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        workflowId: true,
        source: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        // Joined here so the history list never fetches versions one run at a time.
        workflowVersion: { select: { id: true, version: true } },
        workflowApiKey: RUN_API_KEY,
      },
    });
  }
}

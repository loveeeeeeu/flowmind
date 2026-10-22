import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { EXECUTE_WORKFLOW_JOB, type ExecuteWorkflowJobData, WORKFLOW_EXECUTION_QUEUE } from '@flowmind/shared';
import { ToolRuntimeError } from '@flowmind/tool-runtime';
import type { Queue } from 'bullmq';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);
const DEFAULT_POLL_INTERVAL_MS = 400;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface CreatePublishedWorkflowRunParams {
  projectId: string;
  workflowId: string;
  input: Record<string, unknown>;
}

export interface PublishedWorkflowRun {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  output: unknown;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface PublishedWorkflowRunPort {
  createAndEnqueue(params: CreatePublishedWorkflowRunParams): Promise<{ id: string }>;
  waitForTerminal(runId: string): Promise<PublishedWorkflowRun>;
}

/**
 * The internal entry point for anything that runs a published workflow. It does not call an HTTP
 * controller: it performs the same project-scoped version lookup, persists one PUBLISHED run, and
 * places only the run id on BullMQ. The worker later executes the normal workflow runtime.
 */
@Injectable()
export class PublishedWorkflowRunService implements PublishedWorkflowRunPort {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WORKFLOW_EXECUTION_QUEUE)
    private readonly queue: Queue<ExecuteWorkflowJobData>,
  ) {}

  async createAndEnqueue(params: CreatePublishedWorkflowRunParams): Promise<{ id: string }> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: params.workflowId, projectId: params.projectId },
      select: {
        id: true,
        status: true,
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true } },
      },
    });
    // Same error for foreign and missing IDs: an agent cannot probe another project's workflow.
    if (!workflow) throw new ToolRuntimeError('WORKFLOW_NOT_FOUND', 'Workflow not found');
    if (workflow.status === 'ARCHIVED') throw new ToolRuntimeError('WORKFLOW_ARCHIVED', 'Archived workflow cannot be run');
    const version = workflow.versions[0];
    if (!version) throw new ToolRuntimeError('WORKFLOW_NOT_PUBLISHED', 'Workflow has no published version');

    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: version.id,
        source: 'PUBLISHED',
        status: 'PENDING',
        input: toJsonInput(params.input),
      },
      select: { id: true },
    });
    try {
      await this.queue.add(EXECUTE_WORKFLOW_JOB, { runId: run.id }, { jobId: run.id, attempts: 1 });
    } catch (error) {
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Workflow could not be queued', finishedAt: new Date() },
      });
      throw new ToolRuntimeError('WORKFLOW_QUEUE_UNAVAILABLE', 'Workflow could not be queued');
    }
    return run;
  }

  async waitForTerminal(runId: string): Promise<PublishedWorkflowRun> {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const run = await this.prisma.workflowRun.findUnique({
        where: { id: runId },
        select: { id: true, status: true, output: true, errorCode: true, errorMessage: true },
      });
      if (!run) throw new ToolRuntimeError('WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found');
      if (TERMINAL_STATUSES.has(run.status)) {
        return {
          id: run.id,
          status: run.status as PublishedWorkflowRun['status'],
          output: run.output,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
        };
      }
      await delay(DEFAULT_POLL_INTERVAL_MS);
    }
    throw new ToolRuntimeError('WORKFLOW_TOOL_TIMEOUT', 'Workflow did not finish within 60 seconds');
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new ToolRuntimeError('TOOL_INPUT_INVALID', 'Workflow input must be JSON serializable');
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

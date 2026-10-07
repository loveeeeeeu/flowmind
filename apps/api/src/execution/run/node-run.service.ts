import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizeExecutionError } from './execution-error.js';
import { toJsonInput } from './json-value.js';

export interface CreateNodeRunParams {
  workflowRunId: string;
  nodeId: string;
  nodeType: string;
  sequence: number;
  iteration?: number;
  attempt?: number;
  input?: unknown;
}

@Injectable()
export class NodeRunService {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateNodeRunParams) {
    return this.prisma.nodeRun.create({
      data: {
        workflowRunId: params.workflowRunId,
        nodeId: params.nodeId,
        nodeType: params.nodeType,
        sequence: params.sequence,
        iteration: params.iteration,
        attempt: params.attempt ?? 1,
        ...(params.input === undefined
          ? {}
          : { input: toJsonInput(params.input) }),
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
  }

  markSuccess(nodeRunId: string, output: unknown) {
    return this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'SUCCESS',
        ...(output === undefined ? {} : { output: toJsonInput(output) }),
        finishedAt: new Date(),
      },
    });
  }

  markFailed(nodeRunId: string, error: unknown) {
    const { code, message } = normalizeExecutionError(
      error,
      'NODE_EXECUTION_ERROR',
      'Node execution failed',
    );

    return this.prisma.nodeRun.update({
      where: { id: nodeRunId },
      data: {
        status: 'FAILED',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}

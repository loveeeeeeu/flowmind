import { Injectable } from '@nestjs/common';
import type { AgentTracePort } from '@flowmind/workflow-core';
import { ExecutionLogService } from '../execution/execution-log.service.js';

/** Bridges workflow-core's safe Agent action summaries to the existing durable log + SSE path. */
@Injectable()
export class AgentTraceLoggerService implements AgentTracePort {
  constructor(private readonly logs: ExecutionLogService) {}

  async log(input: Parameters<AgentTracePort['log']>[0]) {
    if (!input.workflowRunId) return;
    await this.logs.log({
      workflowRunId: input.workflowRunId,
      nodeRunId: input.nodeRunId,
      level: input.level,
      message: input.message,
      metadata: input.metadata,
    });
  }
}

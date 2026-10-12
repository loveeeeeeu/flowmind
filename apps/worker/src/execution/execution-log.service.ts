import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toJsonInput } from './json-value.js';

export type ExecutionLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface ExecutionLogEntry {
  workflowRunId: string;
  nodeRunId?: string;
  level?: ExecutionLogLevel;
  message: string;
  /** IDs, codes and counts only: never API keys, headers, prompts or full URLs. */
  metadata?: Record<string, unknown>;
}

/**
 * Product-facing run history (shown in the Logs tab), unlike the Nest Logger which writes
 * process stdout. Best-effort: a failed insert is reported to stdout and swallowed,
 * because losing a log line must never fail the workflow it describes.
 */
@Injectable()
export class ExecutionLogService {
  private readonly logger = new Logger(ExecutionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: ExecutionLogEntry): Promise<void> {
    try {
      await this.prisma.executionLog.create({
        data: {
          workflowRunId: entry.workflowRunId,
          nodeRunId: entry.nodeRunId,
          level: entry.level ?? 'INFO',
          message: entry.message,
          ...(entry.metadata === undefined ? {} : { metadata: toJsonInput(entry.metadata) }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write execution log "${entry.message}" for run ${entry.workflowRunId}: ${String(error)}`,
      );
    }
  }
}

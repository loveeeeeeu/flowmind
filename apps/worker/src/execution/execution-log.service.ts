import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sanitizeDebugMetadata } from '@flowmind/shared';
import { RunEventPublisher } from '../execution-events/run-event-publisher.service.js';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RunEventPublisher,
  ) {}

  async log(entry: ExecutionLogEntry): Promise<void> {
    try {
      const log = await this.prisma.executionLog.create({
        data: {
          workflowRunId: entry.workflowRunId,
          nodeRunId: entry.nodeRunId,
          level: entry.level ?? 'INFO',
          message: entry.message,
          ...(entry.metadata === undefined ? {} : { metadata: toJsonInput(entry.metadata) }),
        },
      });

      // PostgreSQL is the log history. Redis only makes an already-persisted log appear live.
      await this.safePublish({
        eventId: randomUUID(),
        runId: entry.workflowRunId,
        type: 'LOG_APPENDED',
        timestamp: log.createdAt.toISOString(),
        log: {
          id: log.id,
          level: log.level,
          nodeRunId: log.nodeRunId,
          message: log.message,
          metadata: sanitizeDebugMetadata(log.metadata),
          createdAt: log.createdAt.toISOString(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write execution log "${entry.message}" for run ${entry.workflowRunId}: ${String(error)}`,
      );
    }
  }

  private async safePublish(event: Parameters<RunEventPublisher['publish']>[0]) {
    try {
      await this.events.publish(event);
    } catch (error) {
      this.logger.warn(
        `Failed to publish execution log for run ${event.runId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

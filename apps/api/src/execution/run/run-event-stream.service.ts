import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getRunEventChannel,
  type RunEvent,
  type RunEventStatus,
  type RunSnapshotEvent,
} from '@flowmind/shared';
import { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { apiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class RunEventStreamService {
  private readonly logger = new Logger(RunEventStreamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async stream(projectId: string, runId: string): Promise<Observable<MessageEvent>> {
    const run = await this.ensureRunAccessible(projectId, runId);
    const channel = getRunEventChannel(runId);

    return new Observable<MessageEvent>((subscriber) => {
      const redis = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
      });
      let closed = false;

      const onMessage = (receivedChannel: string, payload: string) => {
        if (receivedChannel !== channel) {
          return;
        }

        try {
          const event = JSON.parse(payload) as RunEvent;
          subscriber.next({ id: event.eventId, type: event.type, data: event });
        } catch {
          this.logger.warn(`Ignored malformed run event on ${channel}`);
        }
      };

      redis.on('message', onMessage);
      redis.on('error', (error: Error) => {
        if (!closed) {
          this.logger.warn(`Run event subscriber Redis error for ${runId}: ${error.message}`);
        }
      });

      void redis
        .subscribe(channel)
        .then(() => {
          if (!closed) {
            const snapshot = this.toSnapshot(run);
            subscriber.next({ id: snapshot.eventId, type: snapshot.type, data: snapshot });
          }
        })
        .catch((error: unknown) => {
          if (!closed) {
            subscriber.error(error);
          }
        });

      return () => {
        closed = true;
        redis.off('message', onMessage);
        void redis.unsubscribe(channel).finally(() => redis.quit());
      };
    });
  }

  async ensureRunAccessible(projectId: string, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, workflow: { projectId } },
      select: {
        id: true,
        status: true,
        output: true,
        errorCode: true,
        errorMessage: true,
      },
    });

    if (!run) {
      throw apiError.notFound('RUN_NOT_FOUND', 'Run not found');
    }

    return run;
  }

  private toSnapshot(run: {
    id: string;
    status: string;
    output: unknown;
    errorCode: string | null;
    errorMessage: string | null;
  }): RunSnapshotEvent {
    const eventId = `snapshot-${run.id}-${Date.now()}`;
    return {
      eventId,
      runId: run.id,
      type: 'RUN_SNAPSHOT',
      timestamp: new Date().toISOString(),
      status: run.status as RunEventStatus,
      output: run.output,
      error: run.errorCode
        ? { code: run.errorCode, message: run.errorMessage ?? '' }
        : null,
    };
  }
}

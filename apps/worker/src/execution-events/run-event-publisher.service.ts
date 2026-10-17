import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRunEventChannel, type RunEvent } from '@flowmind/shared';
import { Redis } from 'ioredis';

/** Publishes best-effort UI notifications. PostgreSQL remains the execution source of truth. */
@Injectable()
export class RunEventPublisher implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(RunEventPublisher.name);

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
    });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Run event publisher Redis error: ${error.message}`);
    });
  }

  publish(event: RunEvent) {
    return this.redis.publish(getRunEventChannel(event.runId), JSON.stringify(event));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

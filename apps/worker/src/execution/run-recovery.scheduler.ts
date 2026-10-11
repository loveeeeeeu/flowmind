import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { RunRecoveryService } from './run-recovery.service.js';

export const RECOVERY_INTERVAL_MS = 60_000;

/**
 * Scans once on startup and then periodically: a crashed run's heartbeat may still look fresh
 * when the worker restarts quickly, and BullMQ may redeliver the stalled job inside that window.
 */
@Injectable()
export class RunRecoveryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RunRecoveryScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly recovery: RunRecoveryService) {}

  async onApplicationBootstrap() {
    await this.recoverSafely();
    this.timer = setInterval(() => void this.recoverSafely(), RECOVERY_INTERVAL_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async recoverSafely() {
    try {
      await this.recovery.recover();
    } catch (error) {
      this.logger.error(`Run recovery scan failed: ${String(error)}`);
    }
  }
}

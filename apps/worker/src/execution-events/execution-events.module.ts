import { Module } from '@nestjs/common';
import { RunEventPublisher } from './run-event-publisher.service.js';

@Module({
  providers: [RunEventPublisher],
  exports: [RunEventPublisher],
})
export class ExecutionEventsModule {}

import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service.js';

@Module({
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
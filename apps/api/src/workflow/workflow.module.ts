import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { ExecutionModule } from '../execution/execution.module.js';

@Module({
  imports: [LlmModule, ExecutionModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
})
export class WorkflowModule {}
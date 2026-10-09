import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WORKFLOW_EXECUTION_QUEUE } from '@flowmind/shared';
import { ExecutionService } from './execution.service.js';
import { ExecutionQueueService } from './queue/execution-queue.service.js';
import { RunController } from './run/run.controller.js';
import { WorkflowRunService } from './run/workflow-run.service.js';
import { WorkflowPlanService } from './workflow-plan.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE })],
  controllers: [RunController],
  providers: [ExecutionService, WorkflowPlanService, ExecutionQueueService, WorkflowRunService],
  exports: [ExecutionService, WorkflowPlanService],
})
export class ExecutionModule {}

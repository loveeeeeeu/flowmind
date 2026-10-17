import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WORKFLOW_EXECUTION_QUEUE } from '@flowmind/shared';
import { ExecutionService } from './execution.service.js';
import { ExecutionQueueService } from './queue/execution-queue.service.js';
import { RunController } from './run/run.controller.js';
import { RunEventsController } from './run/run-events.controller.js';
import { RunEventStreamService } from './run/run-event-stream.service.js';
import { WorkflowRunService } from './run/workflow-run.service.js';
import { WorkflowPlanService } from './workflow-plan.service.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE }), ProjectModule],
  controllers: [RunController, RunEventsController],
  providers: [
    ExecutionService,
    WorkflowPlanService,
    ExecutionQueueService,
    WorkflowRunService,
    RunEventStreamService,
  ],
  exports: [ExecutionService, WorkflowPlanService],
})
export class ExecutionModule {}

import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowVersionService } from './workflow-version.service.js';
import { WorkflowResourceValidator } from './workflow-resource-validator.service.js';
import { ExecutionModule } from '../execution/execution.module.js';

@Module({
  imports: [ExecutionModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowVersionService, WorkflowResourceValidator],
})
export class WorkflowModule {}

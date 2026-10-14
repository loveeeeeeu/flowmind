import { Module } from '@nestjs/common';
import { ApiKeyModule } from '../api-key/api-key.module.js';
import { ExecutionModule } from '../execution/execution.module.js';
import { ExternalRunController } from './external-run.controller.js';
import { ExternalRunService } from './external-run.service.js';
import { ExternalWorkflowController } from './external-workflow.controller.js';
import { ExternalWorkflowService } from './external-workflow.service.js';

@Module({
  imports: [ExecutionModule, ApiKeyModule],
  controllers: [ExternalWorkflowController, ExternalRunController],
  providers: [ExternalWorkflowService, ExternalRunService],
})
export class ExternalApiModule {}

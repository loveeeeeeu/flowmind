import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { EndExecutor } from './engine/executors/end.executor.js';
import { HttpExecutor } from './engine/executors/http.executor.js';
import { LlmExecutor } from './engine/executors/llm.executor.js';
import { StartExecutor } from './engine/executors/start.executor.js';
import { TemplateExecutor } from './engine/executors/template.executor.js';
import { VariableExecutor } from './engine/executors/variable.executor.js';
import { VariableResolver } from './engine/variable-resolver.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import { ExecutionService } from './execution.service.js';

@Module({
  imports: [LlmModule],
  providers: [
    ExecutionService,
    WorkflowEngine,
    VariableResolver,
    StartExecutor,
    VariableExecutor,
    TemplateExecutor,
    HttpExecutor,
    LlmExecutor,
    EndExecutor,
  ],
  exports: [ExecutionService],
})
export class ExecutionModule {}
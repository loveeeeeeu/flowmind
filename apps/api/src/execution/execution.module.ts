import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { CodeRunnerService } from './code/code-runner.service.js';
import { CodeExecutor } from './engine/executors/code.executor.js';
import { EndExecutor } from './engine/executors/end.executor.js';
import { HttpExecutor } from './engine/executors/http.executor.js';
import { IfExecutor } from './engine/executors/if.executor.js';
import { LlmExecutor } from './engine/executors/llm.executor.js';
import { LoopExecutor } from './engine/executors/loop.executor.js';
import { StartExecutor } from './engine/executors/start.executor.js';
import { TemplateExecutor } from './engine/executors/template.executor.js';
import { VariableExecutor } from './engine/executors/variable.executor.js';
import { VariableResolver } from './engine/variable-resolver.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import { WorkflowScheduler } from './engine/workflow-scheduler.js';
import { ExecutionService } from './execution.service.js';

@Module({
  imports: [LlmModule],
  providers: [
    ExecutionService,
    WorkflowEngine,
    WorkflowScheduler,
    VariableResolver,
    CodeRunnerService,
    StartExecutor,
    VariableExecutor,
    TemplateExecutor,
    HttpExecutor,
    IfExecutor,
    LoopExecutor,
    CodeExecutor,
    LlmExecutor,
    EndExecutor,
  ],
  exports: [ExecutionService],
})
export class ExecutionModule {}
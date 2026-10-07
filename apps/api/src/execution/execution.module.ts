import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { CodeRunnerService } from './code/code-runner.service.js';
import { ExecutorRegistry } from './engine/executor-registry.js';
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
import { WorkflowValidator } from './engine/workflow-validator.js';
import { ExecutionService } from './execution.service.js';
import { ExecutionTracker } from './run/execution-tracker.js';
import { NodeRunService } from './run/node-run.service.js';
import { RunController } from './run/run.controller.js';
import { WorkflowRunService } from './run/workflow-run.service.js';

@Module({
  imports: [LlmModule],
  controllers: [RunController],
  providers: [
    ExecutionService,
    WorkflowEngine,
    WorkflowValidator,
    WorkflowScheduler,
    ExecutorRegistry,
    VariableResolver,
    CodeRunnerService,
    WorkflowRunService,
    NodeRunService,
    ExecutionTracker,
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

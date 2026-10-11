import { ExecutorRegistry } from './engine/executor-registry.js';
import type { NodeRetryPolicy } from './engine/node-retry-policy.js';
import { VariableResolver } from './engine/variable-resolver.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import { WorkflowExecutionError } from './engine/workflow-execution.error.js';
import { WorkflowScheduler } from './engine/workflow-scheduler.js';
import { WorkflowValidator } from './engine/workflow-validator.js';
import { CodeExecutor } from './executors/code.executor.js';
import { EndExecutor } from './executors/end.executor.js';
import { HttpExecutor } from './executors/http.executor.js';
import { IfExecutor } from './executors/if.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import { LoopExecutor } from './executors/loop.executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import type { CodeRunner } from './ports/code-runner.js';
import type { LlmClient } from './ports/llm-client.js';

export interface CreateWorkflowEngineOptions {
  llmClient: LlmClient;
  codeRunner: CodeRunner;
  /** Defaults to DEFAULT_NODE_RETRY_POLICY; tests pass a zero backoff. */
  retryPolicy?: NodeRetryPolicy;
}

function createExecutorRegistry(options: Omit<CreateWorkflowEngineOptions, 'retryPolicy'>) {
  const resolver = new VariableResolver();

  return new ExecutorRegistry([
    new StartExecutor(),
    new VariableExecutor(resolver),
    new TemplateExecutor(resolver),
    new HttpExecutor(resolver),
    new IfExecutor(resolver),
    new LoopExecutor(resolver),
    new CodeExecutor(options.codeRunner, resolver),
    new LlmExecutor(options.llmClient, resolver),
    new EndExecutor(),
  ]);
}

export function createWorkflowEngine(options: CreateWorkflowEngineOptions): WorkflowEngine {
  const registry = createExecutorRegistry(options);

  return new WorkflowEngine(
    new WorkflowValidator(registry),
    new WorkflowScheduler(registry, options.retryPolicy),
  );
}

function unavailable(capability: string): never {
  throw new WorkflowExecutionError(`${capability} is not available in validation-only mode`);
}

/**
 * Validation only asks the registry which node types exist, so the external
 * capabilities are never invoked; processes that cannot execute (the API) use this.
 */
export function createWorkflowValidator(): WorkflowValidator {
  const registry = createExecutorRegistry({
    llmClient: { generate: async () => unavailable('LLM client') },
    codeRunner: { run: async () => unavailable('Code runner') },
  });

  return new WorkflowValidator(registry);
}

import { ExecutorRegistry } from './engine/executor-registry.js';
import { WorkflowExecutionError } from './engine/workflow-execution.error.js';
import type { NodeRetryPolicy } from './engine/node-retry-policy.js';
import { VariableResolver } from './engine/variable-resolver.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import { WorkflowScheduler } from './engine/workflow-scheduler.js';
import { WorkflowValidator } from './engine/workflow-validator.js';
import { CodeExecutor } from './executors/code.executor.js';
import { EndExecutor } from './executors/end.executor.js';
import { HttpExecutor } from './executors/http.executor.js';
import { IfExecutor } from './executors/if.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import { AgentExecutor } from './executors/agent.executor.js';
import { KnowledgeRetrieverExecutor } from './executors/knowledge-retriever.executor.js';
import { LoopExecutor } from './executors/loop.executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import { SUPPORTED_NODE_TYPES } from './node-types.js';
import type { CodeRunner } from './ports/code-runner.js';
import type { LlmClient } from './ports/llm-client.js';
import type { KnowledgeRetrieverPort } from './ports/knowledge-retriever.js';
import type { AgentChatPort, AgentToolPort } from './ports/agent.js';

export interface CreateWorkflowEngineOptions {
  llmClient: LlmClient;
  codeRunner: CodeRunner;
  /** Required by production workers; a default keeps non-retriever engine tests lightweight. */
  knowledgeRetriever?: KnowledgeRetrieverPort;
  agentChat?: AgentChatPort;
  agentTools?: AgentToolPort;
  /** Defaults to DEFAULT_NODE_RETRY_POLICY; tests pass a zero backoff. */
  retryPolicy?: NodeRetryPolicy;
}

function createExecutorRegistry(options: Omit<CreateWorkflowEngineOptions, 'retryPolicy'>) {
  const resolver = new VariableResolver();
  const knowledgeRetriever = options.knowledgeRetriever ?? {
    retrieve: async () => {
      throw new WorkflowExecutionError('Knowledge retriever runtime is not configured', {
        code: 'KNOWLEDGE_RETRIEVER_NOT_CONFIGURED',
      });
    },
  } satisfies KnowledgeRetrieverPort;
  const unavailableAgent = {
    generate: async () => { throw new WorkflowExecutionError('Agent runtime is not configured', { code: 'AGENT_RUNTIME_NOT_CONFIGURED' }); },
  } satisfies AgentChatPort;
  const unavailableTools = {
    listAllowed: async () => { throw new WorkflowExecutionError('Agent tool runtime is not configured', { code: 'AGENT_RUNTIME_NOT_CONFIGURED' }); },
    execute: async () => { throw new WorkflowExecutionError('Agent tool runtime is not configured', { code: 'AGENT_RUNTIME_NOT_CONFIGURED' }); },
  } satisfies AgentToolPort;

  return new ExecutorRegistry([
    new StartExecutor(),
    new VariableExecutor(resolver),
    new TemplateExecutor(resolver),
    new HttpExecutor(resolver),
    new IfExecutor(resolver),
    new LoopExecutor(resolver),
    new CodeExecutor(options.codeRunner, resolver),
    new LlmExecutor(options.llmClient, resolver),
    new AgentExecutor(options.agentChat ?? unavailableAgent, options.agentTools ?? unavailableTools, resolver),
    new KnowledgeRetrieverExecutor(knowledgeRetriever, resolver),
    new EndExecutor(),
  ]);
}

export function createWorkflowEngine(options: CreateWorkflowEngineOptions): WorkflowEngine {
  const registry = createExecutorRegistry(options);
  // Fail at startup rather than at run time if a supported type has no executor.
  const missing = SUPPORTED_NODE_TYPES.filter((type) => !registry.has(type));

  if (missing.length > 0) {
    throw new Error(`No executor registered for node types: ${missing.join(', ')}`);
  }

  return new WorkflowEngine(
    createWorkflowValidator(),
    new WorkflowScheduler(registry, options.retryPolicy),
  );
}

/**
 * Validation needs only the list of supported node types, so processes that never
 * execute nodes (the API at publish time) need no LLM client or code runner.
 */
export function createWorkflowValidator(): WorkflowValidator {
  return new WorkflowValidator(SUPPORTED_NODE_TYPES);
}

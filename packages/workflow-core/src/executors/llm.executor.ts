import type { ExecutionContext } from '../engine/execution-context.js';
import type { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { LlmClient } from '../ports/llm-client.js';
import type { NodeExecutor, NodeRetryMode } from './node-executor.js';

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

export class LlmExecutor implements NodeExecutor {
  readonly type = 'llm';

  constructor(
    private readonly llmClient: LlmClient,
    private readonly resolver: VariableResolver,
  ) {}

  // Retried only when the provider error says so (429 / 5xx / timeout / network), never on auth or balance errors.
  getRetryMode(): NodeRetryMode {
    return 'transient';
  }

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const { modelId, systemPrompt, prompt, temperature, outputVariable } = node.data;

    if (typeof modelId !== 'string' || !modelId.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} requires modelId`);
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no prompt`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no outputVariable`);
    }

    if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
      throw new WorkflowExecutionError(`LLM node ${node.id} has invalid systemPrompt`);
    }

    if (temperature !== undefined && typeof temperature !== 'number') {
      throw new WorkflowExecutionError(`LLM node ${node.id} has invalid temperature`);
    }

    if (
      typeof temperature === 'number' &&
      (temperature < MIN_TEMPERATURE || temperature > MAX_TEMPERATURE)
    ) {
      throw new WorkflowExecutionError(
        `LLM node ${node.id} temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`,
      );
    }

    const renderedPrompt = this.resolver.resolveString(prompt, context);
    const renderedSystemPrompt =
      typeof systemPrompt === 'string' && systemPrompt.trim()
        ? this.resolver.resolveString(systemPrompt, context)
        : undefined;

    const result = await this.llmClient.generate({
      modelId,
      prompt: renderedPrompt,
      systemPrompt: renderedSystemPrompt,
      temperature,
    });

    context.setVariable(outputVariable, result.text);

    return { output: { modelId, text: result.text, usage: result.usage } };
  }
}
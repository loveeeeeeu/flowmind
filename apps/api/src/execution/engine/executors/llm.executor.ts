import { Injectable } from '@nestjs/common';
import { LlmService } from '../../../llm/llm.service.js';
import type { ExecutionContext } from '../execution-context.js';
import { TemplateRenderer } from '../template-renderer.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

@Injectable()
export class LlmExecutor implements NodeExecutor {
  constructor(
    private readonly llmService: LlmService,
    private readonly renderer: TemplateRenderer,
  ) {}

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const { provider, model, systemPrompt, prompt, temperature, outputVariable } = node.data;

    if (typeof provider !== 'string' || !provider.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no provider`);
    }

    if (typeof model !== 'string' || !model.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no model`);
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

    const renderedPrompt = this.renderer.render(prompt, context);
    const renderedSystemPrompt =
      typeof systemPrompt === 'string' && systemPrompt.trim()
        ? this.renderer.render(systemPrompt, context)
        : undefined;

    const result = await this.llmService.generate(provider, {
      model,
      prompt: renderedPrompt,
      systemPrompt: renderedSystemPrompt,
      temperature,
    });

    context.setVariable(outputVariable, result.text);

    return {
      provider,
      model,
      text: result.text,
      usage: result.usage,
    };
  }
}
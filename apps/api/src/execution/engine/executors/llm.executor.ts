import { Injectable } from '@nestjs/common';
import { LlmService } from '../../../llm/llm.service.js';
import type { ExecutionContext } from '../execution-context.js';
import { TemplateRenderer } from '../template-renderer.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

@Injectable()
export class LlmExecutor implements NodeExecutor {
  constructor(
    private readonly llmService: LlmService,
    private readonly renderer: TemplateRenderer,
  ) {}

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const { model, prompt, outputVariable } = node.data;

    if (typeof model !== 'string' || !model.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no model`);
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no prompt`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`LLM node ${node.id} has no outputVariable`);
    }

    const renderedPrompt = this.renderer.render(prompt, context);
    const result = await this.llmService.generate({ model, prompt: renderedPrompt });

    context.setVariable(outputVariable, result.text);

    return {
      text: result.text,
      model,
      usage: result.usage,
    };
  }
}
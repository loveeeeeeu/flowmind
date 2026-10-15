import { ExecutionContext } from '../engine/execution-context.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type { LlmClient, LlmGenerateRequest } from '../ports/llm-client.js';
import { LlmExecutor } from './llm.executor.js';

describe('LlmExecutor', () => {
  let generate: ReturnType<typeof vi.fn<LlmClient['generate']>>;
  let executor: LlmExecutor;

  beforeEach(() => {
    generate = vi.fn(async (request: LlmGenerateRequest) => ({
      text: `hello from ${request.modelId}`,
    }));
    executor = new LlmExecutor({ generate }, new VariableResolver());
  });

  it('passes only modelId and rendered prompts to the llm client', async () => {
    const node: WorkflowNode = {
      id: 'llm',
      type: 'llm',
      data: {
        modelId: 'model-1',
        prompt: 'Hello {{name}}',
        temperature: 0.5,
        outputVariable: 'answer',
      },
    };
    const context = new ExecutionContext({ name: 'FlowMind' });

    const { output } = await executor.execute(node, context);

    expect(generate).toHaveBeenCalledWith({
      modelId: 'model-1',
      prompt: 'Hello FlowMind',
      systemPrompt: undefined,
      temperature: 0.5,
    });
    expect(context.getVariable('answer')).toBe('hello from model-1');
    expect(output).toEqual({ modelId: 'model-1', text: 'hello from model-1', usage: undefined });
  });

  it('ignores legacy provider/model fields and requires modelId', async () => {
    const node: WorkflowNode = {
      id: 'llm',
      type: 'llm',
      data: { provider: 'deepseek', model: 'deepseek-chat', prompt: 'hi', outputVariable: 'a' },
    };

    await expect(executor.execute(node, new ExecutionContext({}))).rejects.toThrow(
      'LLM node llm requires modelId',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not call llm when prompt variable is missing', async () => {
    const node: WorkflowNode = {
      id: 'llm',
      type: 'llm',
      data: {
        modelId: 'model-1',
        prompt: 'Hello {{missing}}',
        outputVariable: 'answer',
      },
    };

    await expect(executor.execute(node, new ExecutionContext({}))).rejects.toThrow(
      'Variable "missing" not found',
    );
    expect(generate).not.toHaveBeenCalled();
  });
});

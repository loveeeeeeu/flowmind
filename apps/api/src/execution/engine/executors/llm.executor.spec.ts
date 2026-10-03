import type { LlmService } from '../../../llm/llm.service.js';
import { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { LlmExecutor } from './llm.executor.js';

describe('LlmExecutor', () => {
  let generate: ReturnType<typeof vi.fn>;
  let executor: LlmExecutor;

  beforeEach(() => {
    generate = vi.fn(async (providerId: string) => ({ text: `hello from ${providerId}` }));
    executor = new LlmExecutor({ generate } as unknown as LlmService, new VariableResolver());
  });

  it('passes provider to llm service and writes output variable', async () => {
    const node: WorkflowNode = {
      id: 'llm',
      type: 'llm',
      data: {
        provider: 'deepseek',
        model: 'test',
        prompt: 'Hello {{name}}',
        temperature: 0.5,
        outputVariable: 'answer',
      },
    };
    const context = new ExecutionContext({ name: 'FlowMind' });

    const output = await executor.execute(node, context);

    expect(generate).toHaveBeenCalledWith('deepseek', {
      model: 'test',
      prompt: 'Hello FlowMind',
      systemPrompt: undefined,
      temperature: 0.5,
    });
    expect(context.getVariable('answer')).toBe('hello from deepseek');
    expect(output).toMatchObject({ provider: 'deepseek', text: 'hello from deepseek' });
  });

  it('does not call llm when prompt variable is missing', async () => {
    const node: WorkflowNode = {
      id: 'llm',
      type: 'llm',
      data: {
        provider: 'deepseek',
        model: 'test',
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
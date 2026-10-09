import { ExecutionContext } from '../engine/execution-context.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import type { CodeRunner } from '../ports/code-runner.js';
import { CodeExecutor } from './code.executor.js';

function codeNode(data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: 'code',
    type: 'code',
    data: { code: 'return input;', inputPath: 'order', outputVariable: 'result', ...data },
  };
}

describe('CodeExecutor', () => {
  let run: ReturnType<typeof vi.fn<CodeRunner['run']>>;
  let executor: CodeExecutor;

  beforeEach(() => {
    run = vi.fn(async () => ({ output: { total: 300 } }));
    executor = new CodeExecutor({ run }, new VariableResolver());
  });

  it('passes resolved input and writes output variable', async () => {
    const context = new ExecutionContext({ order: { price: 100, quantity: 3 } });

    const { output } = await executor.execute(codeNode(), context);

    expect(run).toHaveBeenCalledWith({
      code: 'return input;',
      input: { price: 100, quantity: 3 },
      timeoutMs: 1000,
    });
    expect(output).toEqual({ total: 300 });
    expect(context.getVariable('result')).toEqual({ total: 300 });
  });

  it('supports nested input path', async () => {
    const context = new ExecutionContext({ response: { data: [1, 2] } });

    await executor.execute(codeNode({ inputPath: 'response.data' }), context);

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ input: [1, 2] }));
  });

  it('rejects empty code', async () => {
    await expect(
      executor.execute(codeNode({ code: '  ' }), new ExecutionContext({ order: {} })),
    ).rejects.toThrow('has no code');
  });

  it('rejects code over the length limit', async () => {
    await expect(
      executor.execute(codeNode({ code: 'x'.repeat(20_001) }), new ExecutionContext({ order: {} })),
    ).rejects.toThrow('exceeds maximum code length');
  });

  it.each([10, 6000, '1000'])('rejects invalid timeout %s', async (timeoutMs) => {
    await expect(
      executor.execute(codeNode({ timeoutMs }), new ExecutionContext({ order: {} })),
    ).rejects.toThrow('timeoutMs must be between 50 and 5000');
    expect(run).not.toHaveBeenCalled();
  });
});

import { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { VariableExecutor } from './variable.executor.js';

function variableNode(data: Record<string, unknown>): WorkflowNode {
  return { id: 'variable-1', type: 'variable', data };
}

describe('VariableExecutor', () => {
  const executor = new VariableExecutor(new VariableResolver());

  it('writes literal value by default', async () => {
    const context = new ExecutionContext({});

    await executor.execute(variableNode({ variableName: 'name', value: 'FlowMind' }), context);

    expect(context.getVariable('name')).toBe('FlowMind');
  });

  it('copies value from variable path', async () => {
    const context = new ExecutionContext({ response: { user: { name: 'Jack' } } });

    const { output } = await executor.execute(
      variableNode({ variableName: 'username', sourceType: 'reference', value: 'response.user.name' }),
      context,
    );

    expect(context.getVariable('username')).toBe('Jack');
    expect(output).toEqual({ variableName: 'username', value: 'Jack' });
  });

  it('keeps object type when referencing an object', async () => {
    const context = new ExecutionContext({ response: { user: { name: 'Jack' } } });

    await executor.execute(
      variableNode({ variableName: 'user', sourceType: 'reference', value: 'response.user' }),
      context,
    );

    expect(context.getVariable('user')).toEqual({ name: 'Jack' });
  });

  it('rejects empty reference path', async () => {
    await expect(
      executor.execute(
        variableNode({ variableName: 'x', sourceType: 'reference', value: '' }),
        new ExecutionContext({}),
      ),
    ).rejects.toThrow('has no reference path');
  });

  it('rejects unsupported sourceType', async () => {
    await expect(
      executor.execute(
        variableNode({ variableName: 'x', sourceType: 'expression', value: '1+1' }),
        new ExecutionContext({}),
      ),
    ).rejects.toThrow('unsupported sourceType: expression');
  });
});
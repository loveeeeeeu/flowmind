import { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { LoopExecutor } from './loop.executor.js';

function loopNode(data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: 'loop',
    type: 'loop',
    data: { itemsPath: 'items', itemVariable: 'item', indexVariable: 'index', ...data },
  };
}

describe('LoopExecutor', () => {
  const executor = new LoopExecutor(new VariableResolver());

  it('iterates items then returns done', async () => {
    const context = new ExecutionContext({ items: ['apple', 'banana'] });

    const first = await executor.execute(loopNode(), context);
    expect(first.nextHandle).toBe('body');
    expect(context.getVariable('item')).toBe('apple');
    expect(context.getVariable('index')).toBe(0);

    const second = await executor.execute(loopNode(), context);
    expect(second.nextHandle).toBe('body');
    expect(context.getVariable('item')).toBe('banana');
    expect(context.getVariable('index')).toBe(1);

    const third = await executor.execute(loopNode(), context);
    expect(third).toEqual({ output: { completed: true, iterations: 2 }, nextHandle: 'done' });
  });

  it('immediately finishes empty array', async () => {
    const result = await executor.execute(loopNode(), new ExecutionContext({ items: [] }));

    expect(result.nextHandle).toBe('done');
  });

  it('starts over when re-entered after done', async () => {
    const context = new ExecutionContext({ items: ['a'] });

    await executor.execute(loopNode(), context);
    await executor.execute(loopNode(), context);
    const again = await executor.execute(loopNode(), context);

    expect(again.nextHandle).toBe('body');
    expect(context.getVariable('index')).toBe(0);
  });

  it('supports nested items path', async () => {
    const context = new ExecutionContext({ response: { users: [{ name: 'Jack' }] } });

    await executor.execute(loopNode({ itemsPath: 'response.users' }), context);

    expect(context.getVariable('item')).toEqual({ name: 'Jack' });
  });

  it('rejects non-array items', async () => {
    await expect(
      executor.execute(loopNode(), new ExecutionContext({ items: 'not-array' })),
    ).rejects.toThrow('expected "items" to be an array');
  });

  it('rejects same item and index variable', async () => {
    await expect(
      executor.execute(loopNode({ indexVariable: 'item' }), new ExecutionContext({ items: [] })),
    ).rejects.toThrow('must be different');
  });
});

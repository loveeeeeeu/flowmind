import { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { IfExecutor } from './if.executor.js';

function ifNode(data: Record<string, unknown>): WorkflowNode {
  return { id: 'if', type: 'if', data };
}

describe('IfExecutor', () => {
  const executor = new IfExecutor();

  it.each([
    { operator: 'eq', score: 60, expected: true },
    { operator: 'neq', score: 60, expected: false },
    { operator: 'gt', score: 61, expected: true },
    { operator: 'gte', score: 60, expected: true },
    { operator: 'lt', score: 60, expected: false },
    { operator: 'lte', score: 60, expected: true },
  ])('$operator: score $score vs 60 -> $expected', async ({ operator, score, expected }) => {
    const result = await executor.execute(
      ifNode({ variable: 'score', operator, valueType: 'number', value: '60' }),
      new ExecutionContext({ score }),
    );

    expect(result).toEqual({ output: expected, nextHandle: expected ? 'true' : 'false' });
  });

  it('coerces numeric string variables', async () => {
    const result = await executor.execute(
      ifNode({ variable: 'score', operator: 'gte', valueType: 'number', value: '60' }),
      new ExecutionContext({ score: '85' }),
    );

    expect(result.nextHandle).toBe('true');
  });

  it('compares strings', async () => {
    const result = await executor.execute(
      ifNode({ variable: 'level', operator: 'eq', valueType: 'string', value: 'vip' }),
      new ExecutionContext({ level: 'vip' }),
    );

    expect(result.nextHandle).toBe('true');
  });

  it('compares booleans', async () => {
    const result = await executor.execute(
      ifNode({ variable: 'paid', operator: 'eq', valueType: 'boolean', value: 'true' }),
      new ExecutionContext({ paid: true }),
    );

    expect(result.nextHandle).toBe('true');
  });

  it('rejects missing variable', async () => {
    await expect(
      executor.execute(
        ifNode({ variable: 'score', operator: 'eq', valueType: 'number', value: '60' }),
        new ExecutionContext({}),
      ),
    ).rejects.toThrow('Variable "score" not found');
  });

  it('rejects numeric operator with non-number valueType', async () => {
    await expect(
      executor.execute(
        ifNode({ variable: 'score', operator: 'gt', valueType: 'string', value: '60' }),
        new ExecutionContext({ score: 85 }),
      ),
    ).rejects.toThrow('requires valueType "number"');
  });

  it('rejects non-numeric value instead of silently going false', async () => {
    await expect(
      executor.execute(
        ifNode({ variable: 'score', operator: 'gt', valueType: 'number', value: '60' }),
        new ExecutionContext({ score: 'abc' }),
      ),
    ).rejects.toThrow('is not a number');
  });
});

import { ExecutionContext } from './execution-context.js';
import type { NodeExecutionResult, NodeExecutor } from './executors/node-executor.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { WorkflowScheduler } from './workflow-scheduler.js';

function fakeExecutor(result: NodeExecutionResult = {}) {
  return { execute: vi.fn(async () => result) } satisfies NodeExecutor;
}

function createCanvas(): WorkflowCanvas {
  return {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'if', type: 'if', data: {} },
      { id: 'a', type: 'a', data: {} },
      { id: 'b', type: 'b', data: {} },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { source: 'start', target: 'if' },
      { source: 'if', target: 'a', sourceHandle: 'true' },
      { source: 'if', target: 'b', sourceHandle: 'false' },
      { source: 'a', target: 'end' },
      { source: 'b', target: 'end' },
    ],
  };
}

describe('WorkflowScheduler', () => {
  const scheduler = new WorkflowScheduler();

  function setup(nextHandle: string) {
    const graph = new WorkflowGraph(createCanvas());
    const executors = {
      start: fakeExecutor(),
      if: fakeExecutor({ output: nextHandle === 'true', nextHandle }),
      a: fakeExecutor({ output: 'A' }),
      b: fakeExecutor({ output: 'B' }),
      end: fakeExecutor({ output: 'done' }),
    };
    const run = () =>
      scheduler.run(
        graph,
        graph.getNode('start')!,
        new Map<string, NodeExecutor>(Object.entries(executors)),
        new ExecutionContext({}),
      );

    return { executors, run };
  }

  it('follows the true handle', async () => {
    const { executors, run } = setup('true');
    const result = await run();

    expect(result).toEqual({ result: 'done', executedNodeIds: ['start', 'if', 'a', 'end'] });
    expect(executors.b.execute).not.toHaveBeenCalled();
  });

  it('follows the false handle', async () => {
    const { executors, run } = setup('false');
    const result = await run();

    expect(result.executedNodeIds).toEqual(['start', 'if', 'b', 'end']);
    expect(executors.a.execute).not.toHaveBeenCalled();
  });

  it('rejects unknown handle', async () => {
    const { run } = setup('maybe');

    await expect(run()).rejects.toThrow('Node if has no edge for handle "maybe"');
  });
});

import { LoopExecutor } from '../executors/loop.executor.js';
import type { NodeExecutionResult, NodeExecutor } from '../executors/node-executor.js';
import type {
  ExecutionObserver,
  NodeExecutionEvent,
  NodeFailureEvent,
  NodeSuccessEvent,
} from '../ports/execution-observer.js';
import { ExecutionContext } from './execution-context.js';
import type { ExecutorRegistry } from './executor-registry.js';
import { VariableResolver } from './variable-resolver.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { MAX_EXECUTION_STEPS, WorkflowScheduler } from './workflow-scheduler.js';

function fakeExecutor(type: string, result: NodeExecutionResult = {}) {
  return { type, execute: vi.fn(async () => result) } satisfies NodeExecutor;
}

function createScheduler(executors: NodeExecutor[]) {
  const map = new Map(executors.map((executor) => [executor.type, executor]));
  const registry = {
    get: (type: string) => map.get(type)!,
  } as unknown as ExecutorRegistry;

  return new WorkflowScheduler(registry);
}

function createObserver() {
  const onNodeStart = vi.fn((_event: NodeExecutionEvent) => undefined);
  const onNodeSuccess = vi.fn((_event: NodeSuccessEvent) => undefined);
  const onNodeFailure = vi.fn((_event: NodeFailureEvent) => undefined);
  const observer: ExecutionObserver = { onNodeStart, onNodeSuccess, onNodeFailure };

  return { observer, onNodeStart, onNodeSuccess, onNodeFailure };
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
  function setup(nextHandle: string) {
    const graph = new WorkflowGraph(createCanvas());
    const executors = {
      start: fakeExecutor('start'),
      if: fakeExecutor('if', { output: nextHandle === 'true', nextHandle }),
      a: fakeExecutor('a', { output: 'A' }),
      b: fakeExecutor('b', { output: 'B' }),
      end: fakeExecutor('end', { output: 'done' }),
    };
    const scheduler = createScheduler(Object.values(executors));
    const run = () => scheduler.run(graph, graph.getNode('start')!, new ExecutionContext({}));

    return { executors, run };
  }

  it('follows the true handle', async () => {
    const { executors, run } = setup('true');
    const result = await run();

    expect(result).toEqual({
      result: 'done',
      executedNodeIds: ['start', 'if', 'a', 'end'],
    });
    expect(executors.b.execute).not.toHaveBeenCalled();
  });

  it('follows the false handle', async () => {
    const { executors, run } = setup('false');
    const result = await run();

    expect(result.executedNodeIds).toEqual(['start', 'if', 'b', 'end']);
    expect(executors.a.execute).not.toHaveBeenCalled();
  });

  it('notifies the observer for every node that actually executes', async () => {
    const graph = new WorkflowGraph(createCanvas());
    const { observer, onNodeStart, onNodeSuccess, onNodeFailure } = createObserver();
    const scheduler = createScheduler([
      fakeExecutor('start'),
      fakeExecutor('if', { nextHandle: 'true' }),
      fakeExecutor('a', { output: 'A' }),
      fakeExecutor('b', { output: 'B' }),
      fakeExecutor('end', { output: 'done' }),
    ]);

    await scheduler.run(graph, graph.getNode('start')!, new ExecutionContext({}), { observer });

    expect(onNodeStart.mock.calls.map(([event]) => [event.node.id, event.sequence])).toEqual([
      ['start', 0],
      ['if', 1],
      ['a', 2],
      ['end', 3],
    ]);
    expect(onNodeSuccess).toHaveBeenCalledTimes(4);
    expect(onNodeSuccess).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ sequence: 2, output: 'A' }),
    );
    expect(onNodeFailure).not.toHaveBeenCalled();
  });

  it('reports the failing node to the observer and rethrows executor errors', async () => {
    const graph = new WorkflowGraph(createCanvas());
    const { observer, onNodeSuccess, onNodeFailure } = createObserver();
    const failure = new Error('node failed');
    const scheduler = createScheduler([
      fakeExecutor('start'),
      fakeExecutor('if', { nextHandle: 'true' }),
      {
        type: 'a',
        execute: vi.fn(async () => {
          throw failure;
        }),
      },
      fakeExecutor('b', { output: 'B' }),
      fakeExecutor('end', { output: 'done' }),
    ]);

    await expect(
      scheduler.run(graph, graph.getNode('start')!, new ExecutionContext({}), { observer }),
    ).rejects.toThrow('node failed');

    expect(onNodeSuccess).toHaveBeenCalledTimes(2);
    expect(onNodeFailure).toHaveBeenCalledTimes(1);
    expect(onNodeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 2, error: failure }),
    );
  });

  it('rejects unknown handle', async () => {
    const { run } = setup('maybe');

    await expect(run()).rejects.toThrow('Node if has no edge for handle "maybe"');
  });
});

describe('WorkflowScheduler with loop', () => {
  function createLoopGraph() {
    return new WorkflowGraph({
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'loop',
          type: 'loop',
          data: {
            itemsPath: 'items',
            itemVariable: 'item',
            indexVariable: 'index',
          },
        },
        { id: 'body', type: 'body', data: {} },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { source: 'start', target: 'loop' },
        { source: 'loop', target: 'body', sourceHandle: 'body' },
        { source: 'body', target: 'loop', targetHandle: 'loop' },
        { source: 'loop', target: 'end', sourceHandle: 'done' },
      ],
    });
  }

  function run(
    loopExecutor: NodeExecutor,
    body: NodeExecutor,
    input: Record<string, unknown>,
    observer?: ExecutionObserver,
  ) {
    const graph = createLoopGraph();
    const scheduler = createScheduler([
      fakeExecutor('start'),
      loopExecutor,
      body,
      fakeExecutor('end', { output: 'done' }),
    ]);

    return scheduler.run(graph, graph.getNode('start')!, new ExecutionContext(input), {
      observer,
    });
  }

  it('re-executes the body once per item with a unique sequence each time', async () => {
    const body = fakeExecutor('body', { output: 'B' });
    const { observer, onNodeStart } = createObserver();
    const result = await run(
      new LoopExecutor(new VariableResolver()),
      body,
      { items: ['a', 'b'] },
      observer,
    );

    expect(result.executedNodeIds).toEqual([
      'start',
      'loop',
      'body',
      'loop',
      'body',
      'loop',
      'end',
    ]);
    expect(body.execute).toHaveBeenCalledTimes(2);
    expect(onNodeStart.mock.calls.map(([event]) => [event.node.id, event.sequence])).toEqual([
      ['start', 0],
      ['loop', 1],
      ['body', 2],
      ['loop', 3],
      ['body', 4],
      ['loop', 5],
      ['end', 6],
    ]);
  });

  it('stops a runaway loop at the step limit', async () => {
    const neverDone = fakeExecutor('loop', { nextHandle: 'body' });

    await expect(run(neverDone, fakeExecutor('body'), {})).rejects.toThrow(
      `maximum execution steps (${MAX_EXECUTION_STEPS})`,
    );
  });
});

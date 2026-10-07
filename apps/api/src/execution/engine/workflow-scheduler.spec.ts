import { ExecutionContext } from './execution-context.js';
import type { ExecutorRegistry } from './executor-registry.js';
import { LoopExecutor } from './executors/loop.executor.js';
import type {
  NodeExecutionResult,
  NodeExecutor,
} from './executors/node-executor.js';
import { ExecutionTracker } from '../run/execution-tracker.js';
import type { CreateNodeRunParams } from '../run/node-run.service.js';
import { VariableResolver } from './variable-resolver.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import {
  MAX_EXECUTION_STEPS,
  WorkflowScheduler,
} from './workflow-scheduler.js';

function fakeExecutor(type: string, result: NodeExecutionResult = {}) {
  return { type, execute: vi.fn(async () => result) } satisfies NodeExecutor;
}

function createScheduler(
  executors: NodeExecutor[],
  tracker?: ExecutionTracker,
) {
  const map = new Map(executors.map((executor) => [executor.type, executor]));
  const registry = {
    get: (type: string) => map.get(type)!,
  } as unknown as ExecutorRegistry;
  return new WorkflowScheduler(registry, tracker);
}

function createTracker() {
  let nodeRunNumber = 0;
  const startNode = vi.fn(async (_params: CreateNodeRunParams) => ({
    id: `node-run-${nodeRunNumber++}`,
  }));
  const completeNode = vi.fn(async () => undefined);
  const failNode = vi.fn(async () => undefined);

  return {
    tracker: {
      startNode,
      completeNode,
      failNode,
    } as unknown as ExecutionTracker,
    startNode,
    completeNode,
    failNode,
  };
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
    const run = () =>
      scheduler.run(graph, graph.getNode('start')!, new ExecutionContext({}));

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

  it('records one node run for every node that actually executes', async () => {
    const graph = new WorkflowGraph(createCanvas());
    const tracker = createTracker();
    const executors = [
      fakeExecutor('start'),
      fakeExecutor('if', { nextHandle: 'true' }),
      fakeExecutor('a', { output: 'A' }),
      fakeExecutor('b', { output: 'B' }),
      fakeExecutor('end', { output: 'done' }),
    ];
    const scheduler = createScheduler(executors, tracker.tracker);

    await scheduler.run(
      graph,
      graph.getNode('start')!,
      new ExecutionContext({}),
      {
        workflowRunId: 'run-1',
      },
    );

    expect(tracker.startNode).toHaveBeenCalledTimes(4);
    expect(tracker.startNode).toHaveBeenNthCalledWith(1, {
      workflowRunId: 'run-1',
      nodeId: 'start',
      nodeType: 'start',
      sequence: 0,
    });
    expect(tracker.startNode).toHaveBeenNthCalledWith(4, {
      workflowRunId: 'run-1',
      nodeId: 'end',
      nodeType: 'end',
      sequence: 3,
    });
    expect(tracker.completeNode).toHaveBeenCalledTimes(4);
    expect(tracker.failNode).not.toHaveBeenCalled();
  });

  it('marks the active node run as failed and rethrows executor errors', async () => {
    const graph = new WorkflowGraph(createCanvas());
    const tracker = createTracker();
    const failure = new Error('node failed');
    const scheduler = createScheduler(
      [
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
      ],
      tracker.tracker,
    );

    await expect(
      scheduler.run(graph, graph.getNode('start')!, new ExecutionContext({}), {
        workflowRunId: 'run-1',
      }),
    ).rejects.toThrow('node failed');

    expect(tracker.completeNode).toHaveBeenCalledTimes(2);
    expect(tracker.failNode).toHaveBeenCalledWith('node-run-2', failure);
  });

  it('rejects unknown handle', async () => {
    const { run } = setup('maybe');

    await expect(run()).rejects.toThrow(
      'Node if has no edge for handle "maybe"',
    );
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
    tracker?: ExecutionTracker,
  ) {
    const graph = createLoopGraph();
    const scheduler = createScheduler(
      [
        fakeExecutor('start'),
        loopExecutor,
        body,
        fakeExecutor('end', { output: 'done' }),
      ],
      tracker,
    );

    return scheduler.run(
      graph,
      graph.getNode('start')!,
      new ExecutionContext(input),
      tracker ? { workflowRunId: 'run-1' } : undefined,
    );
  }

  it('re-executes the body once per item', async () => {
    const body = fakeExecutor('body', { output: 'B' });
    const tracker = createTracker();
    const result = await run(
      new LoopExecutor(new VariableResolver()),
      body,
      { items: ['a', 'b'] },
      tracker.tracker,
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
    expect(tracker.startNode).toHaveBeenCalledTimes(7);
    expect(
      tracker.startNode.mock.calls.map(([params]) => [
        params.nodeId,
        params.sequence,
      ]),
    ).toEqual([
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

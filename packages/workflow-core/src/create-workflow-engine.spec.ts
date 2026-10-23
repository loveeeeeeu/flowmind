import { createWorkflowEngine, createWorkflowValidator } from './create-workflow-engine.js';
import type { WorkflowCanvas, WorkflowNode } from './engine/workflow-engine.types.js';
import { WorkflowGraph } from './engine/workflow-graph.js';
import type { NodeExecutionEvent, NodeFailureEvent } from './ports/execution-observer.js';
import type { LlmClient } from './ports/llm-client.js';
import { SUPPORTED_NODE_TYPES } from './node-types.js';

// Node types whose config the validator checks need a minimal valid shape.
const MINIMAL_DATA: Record<string, Record<string, unknown>> = {
  llm: { modelId: 'model-1', prompt: 'Hi' },
  agent: { modelId: 'model-1', prompt: 'Hi', toolNames: [], outputVariable: 'answer' },
  knowledgeRetriever: { knowledgeBaseId: 'kb-1', query: 'question' },
};

function canvasWith(type: string): WorkflowCanvas {
  return {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'node', type, data: MINIMAL_DATA[type] ?? {} },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { source: 'start', target: 'node' },
      { source: 'node', target: 'end' },
    ],
  };
}

describe('createWorkflowValidator', () => {
  const validator = createWorkflowValidator();

  it.each(['llm', 'code', 'http', 'template', 'variable'])(
    'knows node type %s without runtime capabilities',
    (type) => {
      const { executionPlan } = validator.validate(new WorkflowGraph(canvasWith(type)));

      expect(executionPlan.map((node) => node.id)).toEqual(['start', 'node', 'end']);
    },
  );

  it('rejects unknown node type', () => {
    expect(() => validator.validate(new WorkflowGraph(canvasWith('magic')))).toThrow(
      'Unsupported node type: magic',
    );
  });

  it('accepts exactly the shared SUPPORTED_NODE_TYPES that the engine can execute', () => {
    const middleTypes = SUPPORTED_NODE_TYPES.filter(
      (type) => type !== 'start' && type !== 'end' && type !== 'if' && type !== 'loop',
    );

    for (const type of middleTypes) {
      expect(() => validator.validate(new WorkflowGraph(canvasWith(type)))).not.toThrow();
    }
    // Building the engine asserts every supported type has an executor.
    expect(() =>
      createWorkflowEngine({ llmClient: { generate: vi.fn() }, codeRunner: { run: vi.fn() } }),
    ).not.toThrow();
  });
});

describe('createWorkflowEngine node retry', () => {
  const noDelay = { maxAttempts: 3, backoffMs: () => 0 };
  const codeRunner = { run: vi.fn() };

  function canvasWithNode(node: WorkflowNode): WorkflowCanvas {
    return {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        node,
        { id: 'end', type: 'end', data: { outputVariable: 'answer' } },
      ],
      edges: [
        { source: 'start', target: node.id },
        { source: node.id, target: 'end' },
      ],
    };
  }

  const llmCanvas = canvasWithNode({
    id: 'llm',
    type: 'llm',
    data: { modelId: 'model-1', prompt: 'Hi', outputVariable: 'answer' },
  });

  function providerError(code: string, retryable: boolean) {
    return Object.assign(new Error(code), { code, retryable });
  }

  function recordingObserver() {
    const attempts: Array<[string, number, number]> = [];
    const failures: Array<[number, boolean]> = [];

    return {
      attempts,
      failures,
      observer: {
        onNodeStart: ({ node, sequence, attempt }: NodeExecutionEvent) => {
          attempts.push([node.id, sequence, attempt]);
        },
        onNodeFailure: ({ attempt, willRetry }: NodeFailureEvent) => {
          failures.push([attempt, willRetry]);
        },
      },
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries an LLM node after a retryable rate limit and finishes successfully', async () => {
    const generate = vi
      .fn<LlmClient['generate']>()
      .mockRejectedValueOnce(providerError('RATE_LIMIT', true))
      .mockResolvedValueOnce({ text: 'success' });
    const engine = createWorkflowEngine({ llmClient: { generate }, codeRunner, retryPolicy: noDelay });
    const { observer, attempts, failures } = recordingObserver();

    const result = await engine.execute(llmCanvas, {}, { observer });

    expect(result.result).toEqual({ result: 'success' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(attempts).toEqual([
      ['start', 0, 1],
      ['llm', 1, 1],
      ['llm', 1, 2],
      ['end', 2, 1],
    ]);
    expect(failures).toEqual([[1, true]]);
  });

  it('does not retry a non-retryable LLM auth error', async () => {
    const generate = vi.fn<LlmClient['generate']>().mockRejectedValue(providerError('AUTH_ERROR', false));
    const engine = createWorkflowEngine({ llmClient: { generate }, codeRunner, retryPolicy: noDelay });

    await expect(engine.execute(llmCanvas, {})).rejects.toMatchObject({ code: 'AUTH_ERROR' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('never retries an HTTP POST even when the 503 is retryable', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('busy', { status: 503 }));
    const engine = createWorkflowEngine({
      llmClient: { generate: vi.fn() },
      codeRunner,
      retryPolicy: noDelay,
    });
    const canvas = canvasWithNode({
      id: 'http',
      type: 'http',
      data: { method: 'POST', url: 'https://example.com/orders', outputVariable: 'answer' },
    });

    await expect(engine.execute(canvas, {})).rejects.toMatchObject({
      code: 'HTTP_5XX',
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries an HTTP GET on 503', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('pong', { status: 200 }));
    const engine = createWorkflowEngine({
      llmClient: { generate: vi.fn() },
      codeRunner,
      retryPolicy: noDelay,
    });
    const canvas = canvasWithNode({
      id: 'http',
      type: 'http',
      data: { method: 'GET', url: 'https://example.com/ping', outputVariable: 'answer' },
    });

    const result = await engine.execute(canvas, {});

    expect(result.result).toEqual({ result: 'pong' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

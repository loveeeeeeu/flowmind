import type { WorkflowCanvas } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { WorkflowValidator } from './workflow-validator.js';

const SUPPORTED_TYPES = new Set(['start', 'template', 'if', 'loop', 'end']);

const start = { id: 'start', type: 'start', data: {} };
const end = { id: 'end', type: 'end', data: {} };

function template(id: string) {
  return { id, type: 'template', data: { template: id, outputVariable: 'result' } };
}

function createBranchCanvas(): WorkflowCanvas {
  return {
    nodes: [start, { id: 'if', type: 'if', data: {} }, template('pass'), template('fail'), end],
    edges: [
      { source: 'start', target: 'if' },
      { source: 'if', target: 'pass', sourceHandle: 'true' },
      { source: 'if', target: 'fail', sourceHandle: 'false' },
      { source: 'pass', target: 'end' },
      { source: 'fail', target: 'end' },
    ],
  };
}

function createLoopCanvas(): WorkflowCanvas {
  return {
    nodes: [start, { id: 'loop', type: 'loop', data: {} }, template('body'), end],
    edges: [
      { source: 'start', target: 'loop' },
      { source: 'loop', target: 'body', sourceHandle: 'body' },
      { source: 'body', target: 'loop', targetHandle: 'loop' },
      { source: 'loop', target: 'end', sourceHandle: 'done' },
    ],
  };
}

describe('WorkflowValidator', () => {
  const validator = new WorkflowValidator(SUPPORTED_TYPES);

  function validate(canvas: WorkflowCanvas) {
    return validator.validate(new WorkflowGraph(canvas));
  }

  it('returns start node and execution plan', () => {
    const result = validate({
      nodes: [start, template('a'), end],
      edges: [
        { source: 'start', target: 'a' },
        { source: 'a', target: 'end' },
      ],
    });

    expect(result.startNode.id).toBe('start');
    expect(result.executionPlan.map((node) => node.id)).toEqual(['start', 'a', 'end']);
  });

  it('rejects empty workflow', () => {
    expect(() => validate({ nodes: [], edges: [] })).toThrow('Workflow has no nodes');
  });

  it('rejects workflow without start node', () => {
    expect(() => validate({ nodes: [end], edges: [] })).toThrow(
      'Workflow must have exactly one start node',
    );
  });

  it('rejects normal cycle', () => {
    expect(() =>
      validate({
        nodes: [start, template('a'), template('b'), end],
        edges: [
          { source: 'start', target: 'a' },
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
          { source: 'b', target: 'end' },
        ],
      }),
    ).toThrow('Workflow contains a cycle');
  });

  it('accepts legal loop-back edge', () => {
    expect(validate(createLoopCanvas()).executionPlan).toHaveLength(4);
  });

  it('treats back edge without loop handle as a cycle', () => {
    const canvas = createLoopCanvas();
    canvas.edges[2] = { source: 'body', target: 'loop' };

    expect(() => validate(canvas)).toThrow('Workflow contains a cycle');
  });

  it('rejects node unreachable from start', () => {
    expect(() =>
      validate({
        nodes: [start, template('unused'), end],
        edges: [{ source: 'start', target: 'end' }],
      }),
    ).toThrow('Node unused is not reachable from start');
  });

  it('rejects node that cannot reach end', () => {
    expect(() =>
      validate({
        nodes: [start, template('dead-end'), end],
        edges: [
          { source: 'start', target: 'end' },
          { source: 'start', target: 'dead-end' },
        ],
      }),
    ).toThrow('Node dead-end cannot reach end');
  });

  it('rejects unsupported node type before running', () => {
    expect(() =>
      validate({
        nodes: [start, { id: 'm', type: 'magic', data: {} }, end],
        edges: [
          { source: 'start', target: 'm' },
          { source: 'm', target: 'end' },
        ],
      }),
    ).toThrow('Unsupported node type: magic');
  });

  it('rejects IF without false branch', () => {
    const canvas = createBranchCanvas();
    canvas.nodes = canvas.nodes.filter((node) => node.id !== 'fail');
    canvas.edges = canvas.edges.filter((edge) => edge.source !== 'fail' && edge.target !== 'fail');

    expect(() => validate(canvas)).toThrow(/exactly one true edge and one false edge/);
  });

  it('rejects IF with two true edges', () => {
    const canvas = createBranchCanvas();
    canvas.edges[2] = { source: 'if', target: 'fail', sourceHandle: 'true' };

    expect(() => validate(canvas)).toThrow(/exactly one true edge and one false edge/);
  });

  it('rejects parallel fork at runtime structure check', () => {
    expect(() =>
      validate({
        nodes: [start, template('a'), template('b'), end],
        edges: [
          { source: 'start', target: 'a' },
          { source: 'start', target: 'b' },
          { source: 'a', target: 'end' },
          { source: 'b', target: 'end' },
        ],
      }),
    ).toThrow('Node start must have exactly one outgoing edge');
  });

  it('rejects loop-back edge coming from the done branch', () => {
    expect(() =>
      validate({
        nodes: [start, { id: 'loop', type: 'loop', data: {} }, template('a'), template('b'), end],
        edges: [
          { source: 'start', target: 'loop' },
          { source: 'loop', target: 'a', sourceHandle: 'body' },
          { source: 'a', target: 'end' },
          { source: 'loop', target: 'b', sourceHandle: 'done' },
          { source: 'b', target: 'loop', targetHandle: 'loop' },
        ],
      }),
    ).toThrow('loop-back edge must come from the body branch');
  });
});

describe('WorkflowValidator LLM node config', () => {
  const validator = new WorkflowValidator(['start', 'llm', 'end']);

  function validateLlm(data: Record<string, unknown>) {
    return validator.validate(
      new WorkflowGraph({
        nodes: [start, { id: 'llm', type: 'llm', data }, end],
        edges: [
          { source: 'start', target: 'llm' },
          { source: 'llm', target: 'end' },
        ],
      }),
    );
  }

  it('accepts a node referencing a model by id', () => {
    expect(() => validateLlm({ modelId: 'model-1', prompt: 'Hi' })).not.toThrow();
  });

  it.each([
    ['an unselected model', { modelId: '', prompt: 'Hi' }],
    ['a missing modelId', { prompt: 'Hi' }],
    ['a non-string modelId', { modelId: 42, prompt: 'Hi' }],
  ])('rejects %s', (_name, data) => {
    expect(() => validateLlm(data)).toThrow('LLM node llm requires modelId');
  });

  it('points legacy provider/model nodes at Model Center', () => {
    expect(() => validateLlm({ provider: 'deepseek', model: 'deepseek-chat', prompt: 'Hi' })).toThrow(
      'LLM node llm uses the legacy provider/model configuration; select a model from Model Center',
    );
  });

  it('requires a prompt', () => {
    expect(() => validateLlm({ modelId: 'model-1', prompt: '  ' })).toThrow('LLM node llm requires prompt');
  });
});

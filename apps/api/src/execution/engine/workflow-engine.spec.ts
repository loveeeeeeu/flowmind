import { WorkflowEngine } from './workflow-engine.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  function createBasicCanvas(): WorkflowCanvas {
    return {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'template',
          type: 'template',
          data: { template: 'Hello {{name}}', outputVariable: 'result' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'template' },
        { id: 'e2', source: 'template', target: 'end' },
      ],
    };
  }

  it('creates execution plan in dependency order', () => {
    const plan = engine.buildExecutionPlan(createBasicCanvas());
    expect(plan.map((node) => node.id)).toEqual(['start', 'template', 'end']);
  });

  it('executes start -> template -> end', async () => {
    const result = await engine.execute(createBasicCanvas(), { name: 'FlowMind' });

    expect(result.result).toEqual({ result: 'Hello FlowMind' });
    expect(result.variables).toEqual({
      name: 'FlowMind',
      result: 'Hello FlowMind',
    });
  });

  it('rejects workflow without start node', () => {
    const canvas: WorkflowCanvas = {
      nodes: [{ id: 'end', type: 'end', data: { outputVariable: 'result' } }],
      edges: [],
    };

    expect(() => engine.buildExecutionPlan(canvas)).toThrow(
      'Workflow must have exactly one start node',
    );
  });

  it('rejects cyclic workflow', () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'a', type: 'template', data: { template: 'A', outputVariable: 'a' } },
        { id: 'b', type: 'template', data: { template: 'B', outputVariable: 'b' } },
        { id: 'end', type: 'end', data: { outputVariable: 'b' } },
      ],
      edges: [
        { source: 'start', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
        { source: 'b', target: 'end' },
      ],
    };

    expect(() => engine.buildExecutionPlan(canvas)).toThrow('Workflow contains a cycle');
  });

  it('rejects isolated node', () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'unused', type: 'template', data: { template: 'x', outputVariable: 'x' } },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [{ source: 'start', target: 'end' }],
    };

    expect(() => engine.buildExecutionPlan(canvas)).toThrow(
      'Node unused is not reachable from start',
    );
  });

  it('rejects node that cannot reach end', () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'dead-end', type: 'template', data: { template: 'x', outputVariable: 'x' } },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { source: 'start', target: 'end' },
        { source: 'start', target: 'dead-end' },
      ],
    };

    expect(() => engine.buildExecutionPlan(canvas)).toThrow(
      'Node dead-end cannot reach end',
    );
  });

  it('writes variable into execution context', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'variable',
          type: 'variable',
          data: { variableName: 'name', value: 'FlowMind' },
        },
        {
          id: 'template',
          type: 'template',
          data: { template: 'Hello {{name}}', outputVariable: 'result' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { source: 'start', target: 'variable' },
        { source: 'variable', target: 'template' },
        { source: 'template', target: 'end' },
      ],
    };

    const result = await engine.execute(canvas, {});

    expect(result.variables).toEqual({
      name: 'FlowMind',
      result: 'Hello FlowMind',
    });
    expect(result.result).toEqual({ result: 'Hello FlowMind' });
  });

  it('allows variable node to overwrite input variable', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'variable',
          type: 'variable',
          data: { variableName: 'name', value: 'FlowMind' },
        },
        {
          id: 'template',
          type: 'template',
          data: { template: 'Hello {{name}}', outputVariable: 'result' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { source: 'start', target: 'variable' },
        { source: 'variable', target: 'template' },
        { source: 'template', target: 'end' },
      ],
    };

    const result = await engine.execute(canvas, { name: 'Jack' });
    expect(result.variables.name).toBe('FlowMind');
  });
});
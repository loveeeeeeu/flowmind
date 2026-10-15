import { createWorkflowEngine } from '../create-workflow-engine.js';
import type { LlmClient, LlmGenerateRequest } from '../ports/llm-client.js';
import type { WorkflowEngine } from './workflow-engine.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let generate: ReturnType<typeof vi.fn<LlmClient['generate']>>;

  beforeEach(() => {
    generate = vi.fn(async (request: LlmGenerateRequest) => ({
      text: `Mock response from ${request.modelId}`,
    }));

    engine = createWorkflowEngine({
      llmClient: { generate },
      codeRunner: { run: vi.fn(async () => ({ output: { total: 300 } })) },
    });
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

  it('executes llm node with rendered prompts and its modelId', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: {
            modelId: 'model-1',
            systemPrompt: 'You are helping {{name}}.',
            prompt: 'Hello {{name}}',
            temperature: 0.3,
            outputVariable: 'answer',
          },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'answer' } },
      ],
      edges: [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'end' },
      ],
    };
  
    const result = await engine.execute(canvas, { name: 'FlowMind' });
  
    expect(generate).toHaveBeenCalledWith({
      modelId: 'model-1',
      prompt: 'Hello FlowMind',
      systemPrompt: 'You are helping FlowMind.',
      temperature: 0.3,
    });
    expect(result.result).toEqual({ result: 'Mock response from model-1' });
  });
  
  it('routes different llm nodes to different models', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm-a',
          type: 'llm',
          data: { modelId: 'model-a', prompt: 'Hello {{name}}', outputVariable: 'a' },
        },
        {
          id: 'llm-b',
          type: 'llm',
          data: { modelId: 'model-b', prompt: 'Echo {{a}}', outputVariable: 'b' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'b' } },
      ],
      edges: [
        { source: 'start', target: 'llm-a' },
        { source: 'llm-a', target: 'llm-b' },
        { source: 'llm-b', target: 'end' },
      ],
    };
  
    const result = await engine.execute(canvas, { name: 'FlowMind' });
  
    expect(generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ modelId: 'model-a', prompt: 'Hello FlowMind' }),
    );
    expect(generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ modelId: 'model-b', prompt: 'Echo Mock response from model-a' }),
    );
    expect(result.result).toEqual({ result: 'Mock response from model-b' });
  });
  
  it('rejects a legacy provider/model llm node before running anything', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: { provider: 'deepseek', model: 'm', prompt: 'hi', outputVariable: 'a' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'a' } },
      ],
      edges: [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'end' },
      ],
    };
  
    await expect(engine.execute(canvas, {})).rejects.toThrow(
      'LLM node llm uses the legacy provider/model configuration',
    );
    expect(generate).not.toHaveBeenCalled();
  });
  
  it('rejects temperature out of range', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: { modelId: 'model-1', prompt: 'hi', temperature: 3, outputVariable: 'a' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'a' } },
      ],
      edges: [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'end' },
      ],
    };
  
    await expect(engine.execute(canvas, {})).rejects.toThrow(
      'LLM node llm temperature must be between 0 and 2',
    );
  });

  function createBranchCanvas(): WorkflowCanvas {
    return {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'if',
          type: 'if',
          data: { variable: 'score', operator: 'gte', valueType: 'number', value: '60' },
        },
        { id: 'pass', type: 'template', data: { template: 'Passed', outputVariable: 'result' } },
        { id: 'fail', type: 'template', data: { template: 'Failed', outputVariable: 'result' } },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { source: 'start', target: 'if' },
        { source: 'if', target: 'pass', sourceHandle: 'true' },
        { source: 'if', target: 'fail', sourceHandle: 'false' },
        { source: 'pass', target: 'end' },
        { source: 'fail', target: 'end' },
      ],
    };
  }

  it('runs only the true branch when condition matches', async () => {
    const result = await engine.execute(createBranchCanvas(), { score: 85 });

    expect(result.result).toEqual({ result: 'Passed' });
    expect(result.executedNodeIds).toEqual(['start', 'if', 'pass', 'end']);
    expect(result.nodeOutputs).not.toHaveProperty('fail');
  });

  it('runs only the false branch when condition does not match', async () => {
    const result = await engine.execute(createBranchCanvas(), { score: 40 });

    expect(result.result).toEqual({ result: 'Failed' });
    expect(result.executedNodeIds).toEqual(['start', 'if', 'fail', 'end']);
    expect(result.nodeOutputs).not.toHaveProperty('pass');
  });

  it('resolves nested paths in IF and template', async () => {
    const canvas = createBranchCanvas();
    canvas.nodes[1].data.variable = 'response.user.score';
    canvas.nodes[2].data.template = 'Passed {{response.user.name}}';
  
    const result = await engine.execute(canvas, {
      response: { user: { name: 'Jack', score: 85 } },
    });
  
    expect(result.result).toEqual({ result: 'Passed Jack' });
  });

  function createLoopCanvas(): WorkflowCanvas {
    return {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'loop',
          type: 'loop',
          data: { itemsPath: 'items', itemVariable: 'item', indexVariable: 'index' },
        },
        {
          id: 'template',
          type: 'template',
          data: { template: '{{index}}:{{item}}', outputVariable: 'result' },
        },
        { id: 'end', type: 'end', data: { outputVariable: 'result' } },
      ],
      edges: [
        { source: 'start', target: 'loop' },
        { source: 'loop', target: 'template', sourceHandle: 'body' },
        { source: 'template', target: 'loop', targetHandle: 'loop' },
        { source: 'loop', target: 'end', sourceHandle: 'done' },
      ],
    };
  }

  it('runs loop body once per item', async () => {
    const result = await engine.execute(createLoopCanvas(), {
      items: ['apple', 'banana', 'orange'],
    });

    expect(result.result).toEqual({ result: '2:orange' });
    expect(result.executedNodeIds).toEqual([
      'start', 'loop', 'template', 'loop', 'template', 'loop', 'template', 'loop', 'end',
    ]);
  });

  it('feeds code output into IF and template', async () => {
    const canvas = createBranchCanvas();
    canvas.nodes.splice(1, 0, {
      id: 'code',
      type: 'code',
      data: { code: 'return {};', inputPath: 'order', outputVariable: 'calculation' },
    });
    canvas.edges[0] = { source: 'start', target: 'code' };
    canvas.edges.unshift({ source: 'code', target: 'if' });
    canvas.nodes[2].data.variable = 'calculation.total';
    canvas.nodes[3].data.template = 'Total {{calculation.total}}';

    const result = await engine.execute(canvas, { order: { price: 100, quantity: 3 } });

    expect(result.result).toEqual({ result: 'Total 300' });
    expect(result.executedNodeIds).toEqual(['start', 'code', 'if', 'pass', 'end']);
  });

  it('validates the whole graph before executing any node', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: { modelId: 'model-1', prompt: 'hi', outputVariable: 'a' },
        },
        { id: 'magic', type: 'magic', data: {} },
        { id: 'end', type: 'end', data: { outputVariable: 'a' } },
      ],
      edges: [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'magic' },
        { source: 'magic', target: 'end' },
      ],
    };

    await expect(engine.execute(canvas, {})).rejects.toThrow('Unsupported node type: magic');
    expect(generate).not.toHaveBeenCalled();
  });
});
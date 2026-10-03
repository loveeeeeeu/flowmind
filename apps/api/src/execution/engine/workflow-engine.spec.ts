import type { LlmService } from '../../llm/llm.service.js';
import { EndExecutor } from './executors/end.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import { HttpExecutor } from './executors/http.executor.js';
import { VariableResolver } from './variable-resolver.js';
import { WorkflowEngine } from './workflow-engine.js';
import type { WorkflowCanvas } from './workflow-engine.types.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let generate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const resolver = new VariableResolver();
    generate = vi.fn(async (providerId: string) => ({ text: `Mock response from ${providerId}` }));
    const fakeLlmService = { generate } as unknown as LlmService;
  
    engine = new WorkflowEngine(
      new StartExecutor(),
      new VariableExecutor(),
      new TemplateExecutor(resolver),
      new HttpExecutor(resolver),
      new LlmExecutor(fakeLlmService, resolver),
      new EndExecutor(),
    );
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

  it('executes llm node with rendered prompts and provider', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: {
            provider: 'deepseek',
            model: 'test-model',
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
  
    expect(generate).toHaveBeenCalledWith('deepseek', {
      model: 'test-model',
      prompt: 'Hello FlowMind',
      systemPrompt: 'You are helping FlowMind.',
      temperature: 0.3,
    });
    expect(result.result).toEqual({ result: 'Mock response from deepseek' });
  });
  
  it('routes different llm nodes to different providers', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm-a',
          type: 'llm',
          data: { provider: 'deepseek', model: 'm1', prompt: 'Hello {{name}}', outputVariable: 'a' },
        },
        {
          id: 'llm-b',
          type: 'llm',
          data: { provider: 'custom', model: 'm2', prompt: 'Echo {{a}}', outputVariable: 'b' },
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
      'deepseek',
      expect.objectContaining({ prompt: 'Hello FlowMind' }),
    );
    expect(generate).toHaveBeenNthCalledWith(
      2,
      'custom',
      expect.objectContaining({ prompt: 'Echo Mock response from deepseek' }),
    );
    expect(result.result).toEqual({ result: 'Mock response from custom' });
  });
  
  it('rejects llm node without provider', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'llm', type: 'llm', data: { model: 'm', prompt: 'hi', outputVariable: 'a' } },
        { id: 'end', type: 'end', data: { outputVariable: 'a' } },
      ],
      edges: [
        { source: 'start', target: 'llm' },
        { source: 'llm', target: 'end' },
      ],
    };
  
    await expect(engine.execute(canvas, {})).rejects.toThrow('LLM node llm has no provider');
    expect(generate).not.toHaveBeenCalled();
  });
  
  it('rejects temperature out of range', async () => {
    const canvas: WorkflowCanvas = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        {
          id: 'llm',
          type: 'llm',
          data: { provider: 'deepseek', model: 'm', prompt: 'hi', temperature: 3, outputVariable: 'a' },
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
});
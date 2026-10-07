import { ServiceUnavailableException } from '@nestjs/common';
import { LlmProviderError } from '../llm/errors/llm-provider.error.js';
import type { WorkflowEngine } from './engine/workflow-engine.js';
import type { WorkflowCanvas } from './engine/workflow-engine.types.js';
import { ExecutionService } from './execution.service.js';
import type { WorkflowRunService } from './run/workflow-run.service.js';

const canvas: WorkflowCanvas = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: {} },
  ],
  edges: [{ source: 'start', target: 'end' }],
};

function createRuns() {
  return {
    create: vi.fn(async () => ({ id: 'run-1' })),
    markRunning: vi.fn(async () => undefined),
    markSuccess: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    findByWorkflow: vi.fn(async () => []),
  };
}

describe('ExecutionService', () => {
  it('persists a workflow run around a successful engine execution', async () => {
    const executionResult = {
      result: { answer: 'done' },
      executedNodeIds: ['start', 'end'],
      variables: { topic: 'AI' },
      nodeOutputs: { end: { answer: 'done' } },
    };
    const execute = vi.fn(async () => executionResult);
    const engine = { execute } as unknown as WorkflowEngine;
    const runs = createRuns();
    const service = new ExecutionService(
      engine,
      runs as unknown as WorkflowRunService,
    );

    await expect(
      service.execute({
        workflowId: 'workflow-1',
        canvas,
        input: { topic: 'AI' },
      }),
    ).resolves.toEqual({ runId: 'run-1', ...executionResult });

    expect(runs.create).toHaveBeenCalledWith('workflow-1', { topic: 'AI' });
    expect(runs.markRunning).toHaveBeenCalledWith('run-1');
    expect(execute).toHaveBeenCalledWith(
      canvas,
      { topic: 'AI' },
      { workflowRunId: 'run-1' },
    );
    expect(runs.markSuccess).toHaveBeenCalledWith('run-1', executionResult);
    expect(runs.markFailed).not.toHaveBeenCalled();
  });

  it('persists the native provider error before mapping it to HTTP', async () => {
    const providerError = new LlmProviderError({
      providerId: 'deepseek',
      code: 'RATE_LIMIT',
      message: 'Rate limited',
      retryable: true,
    });
    const execute = vi.fn(async () => {
      throw providerError;
    });
    const engine = { execute } as unknown as WorkflowEngine;
    const runs = createRuns();
    const service = new ExecutionService(
      engine,
      runs as unknown as WorkflowRunService,
    );

    await expect(
      service.execute({ workflowId: 'workflow-1', canvas, input: {} }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(runs.markFailed).toHaveBeenCalledWith('run-1', providerError);
    expect(runs.markSuccess).not.toHaveBeenCalled();
  });
});

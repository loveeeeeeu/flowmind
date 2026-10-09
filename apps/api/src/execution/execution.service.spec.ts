import { ExecutionService } from './execution.service.js';
import type { ExecutionQueueService } from './queue/execution-queue.service.js';
import type { WorkflowRunService } from './run/workflow-run.service.js';

function createRuns() {
  return {
    create: vi.fn(async () => ({
      id: 'run-1',
      workflowId: 'workflow-1',
      status: 'PENDING',
    })),
    markFailed: vi.fn(async () => undefined),
    findByWorkflow: vi.fn(async () => []),
  };
}

describe('ExecutionService', () => {
  it('creates a pending run and enqueues it without starting execution', async () => {
    const runs = createRuns();
    const enqueueRun = vi.fn(async () => ({ id: 'run-1' }));
    const queue = { enqueueRun } as unknown as ExecutionQueueService;
    const service = new ExecutionService(
      runs as unknown as WorkflowRunService,
      queue,
    );

    await expect(
      service.createRun({ workflowId: 'workflow-1', input: { topic: 'AI' } }),
    ).resolves.toEqual({
      id: 'run-1',
      workflowId: 'workflow-1',
      status: 'PENDING',
    });

    expect(runs.create).toHaveBeenCalledWith('workflow-1', { topic: 'AI' });
    expect(enqueueRun).toHaveBeenCalledWith('run-1');
    expect(runs.markFailed).not.toHaveBeenCalled();
  });

  it('marks the run as failed if it cannot be enqueued', async () => {
    const enqueueError = new Error('Redis is unavailable');
    const runs = createRuns();
    const enqueueRun = vi.fn(async () => {
      throw enqueueError;
    });
    const queue = { enqueueRun } as unknown as ExecutionQueueService;
    const service = new ExecutionService(
      runs as unknown as WorkflowRunService,
      queue,
    );

    await expect(
      service.createRun({ workflowId: 'workflow-1', input: {} }),
    ).rejects.toBe(enqueueError);

    expect(runs.markFailed).toHaveBeenCalledWith('run-1', enqueueError);
  });
});

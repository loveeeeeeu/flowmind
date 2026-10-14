import { ExecutionService } from './execution.service.js';
import type { ExecutionQueueService } from './queue/execution-queue.service.js';
import type { WorkflowRunService } from './run/workflow-run.service.js';

const canvas = { nodes: [], edges: [] };

function setup(enqueueRun = vi.fn(async () => ({ id: 'job' }))) {
  const runs = {
    createPublished: vi.fn(async () => ({ id: 'run-1', source: 'PUBLISHED', status: 'PENDING' })),
    createDraft: vi.fn(async () => ({ id: 'run-2', source: 'DRAFT', status: 'PENDING' })),
    markFailed: vi.fn(async () => undefined),
    findByWorkflow: vi.fn(async () => []),
  };
  const service = new ExecutionService(
    runs as unknown as WorkflowRunService,
    { enqueueRun } as unknown as ExecutionQueueService,
  );

  return { service, runs, enqueueRun };
}

describe('ExecutionService', () => {
  it('creates a published run and enqueues only its id', async () => {
    const { service, runs, enqueueRun } = setup();
    const params = { workflowId: 'workflow-1', workflowVersionId: 'version-1', input: { a: 1 } };

    await expect(service.createPublishedRun(params)).resolves.toMatchObject({
      id: 'run-1',
      source: 'PUBLISHED',
    });

    expect(runs.createPublished).toHaveBeenCalledWith(params);
    expect(runs.createDraft).not.toHaveBeenCalled();
    expect(enqueueRun).toHaveBeenCalledWith('run-1');
  });

  it('creates a draft run and enqueues only its id', async () => {
    const { service, runs, enqueueRun } = setup();
    const params = { workflowId: 'workflow-1', canvas, input: {} };

    await expect(service.createDraftRun(params)).resolves.toMatchObject({
      id: 'run-2',
      source: 'DRAFT',
    });

    expect(runs.createDraft).toHaveBeenCalledWith(params);
    expect(runs.createPublished).not.toHaveBeenCalled();
    expect(enqueueRun).toHaveBeenCalledWith('run-2');
  });

  it('marks the run as failed if it cannot be enqueued', async () => {
    const enqueueError = new Error('Redis is unavailable');
    const { service, runs } = setup(
      vi.fn(async () => {
        throw enqueueError;
      }),
    );

    await expect(
      service.createDraftRun({ workflowId: 'workflow-1', canvas, input: {} }),
    ).rejects.toBe(enqueueError);

    expect(runs.markFailed).toHaveBeenCalledWith('run-2', enqueueError);
  });
});

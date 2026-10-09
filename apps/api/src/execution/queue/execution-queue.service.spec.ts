import type { Queue } from 'bullmq';
import {
  EXECUTE_WORKFLOW_JOB,
  WORKFLOW_EXECUTION_QUEUE,
} from './execution-queue.constants.js';
import { ExecutionQueueService } from './execution-queue.service.js';
import type { ExecuteWorkflowJobData } from './execution-queue.types.js';

describe('ExecutionQueueService', () => {
  it('enqueues a workflow run using the run id as the BullMQ job id', async () => {
    const add = vi.fn(async () => ({ id: 'run-1' }));
    const queue = { add } as unknown as Queue<ExecuteWorkflowJobData>;
    const service = new ExecutionQueueService(queue);

    await service.enqueueRun('run-1');

    expect(add).toHaveBeenCalledWith(
      EXECUTE_WORKFLOW_JOB,
      { runId: 'run-1' },
      { jobId: 'run-1' },
    );
    expect(WORKFLOW_EXECUTION_QUEUE).toBe('workflow-execution');
  });
});

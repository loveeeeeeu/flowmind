import {
  EXECUTE_WORKFLOW_JOB,
  type ExecuteWorkflowJobData,
  WORKFLOW_EXECUTION_QUEUE,
} from '@flowmind/shared';
import type { Queue } from 'bullmq';
import { ExecutionQueueService } from './execution-queue.service.js';

describe('ExecutionQueueService', () => {
  it('enqueues a run once: run id as job id, no automatic whole-job retry', async () => {
    const add = vi.fn(async () => ({ id: 'run-1' }));
    const queue = { add } as unknown as Queue<ExecuteWorkflowJobData>;
    const service = new ExecutionQueueService(queue);

    await service.enqueueRun('run-1');

    expect(add).toHaveBeenCalledWith(
      EXECUTE_WORKFLOW_JOB,
      { runId: 'run-1' },
      { jobId: 'run-1', attempts: 1 },
    );
    expect(WORKFLOW_EXECUTION_QUEUE).toBe('workflow-execution');
  });
});

import { EXECUTE_WORKFLOW_JOB, type ExecuteWorkflowJobData } from '@flowmind/shared';
import type { Job } from 'bullmq';
import type { WorkflowExecutionService } from './workflow-execution.service.js';
import { WorkflowRunProcessor } from './workflow-run.processor.js';

function job(name: string): Job<ExecuteWorkflowJobData> {
  return { name, data: { runId: 'run-1' } } as Job<ExecuteWorkflowJobData>;
}

describe('WorkflowRunProcessor', () => {
  it('executes the run referenced by the job', async () => {
    const executeRun = vi.fn(async () => undefined);
    const processor = new WorkflowRunProcessor({ executeRun } as unknown as WorkflowExecutionService);

    await processor.process(job(EXECUTE_WORKFLOW_JOB));

    expect(executeRun).toHaveBeenCalledWith('run-1');
  });

  it('rejects unknown job names', async () => {
    const executeRun = vi.fn();
    const processor = new WorkflowRunProcessor({ executeRun } as unknown as WorkflowExecutionService);

    await expect(processor.process(job('something-else'))).rejects.toThrow(
      'Unsupported job: something-else',
    );
    expect(executeRun).not.toHaveBeenCalled();
  });
});

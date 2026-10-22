import { PublishedWorkflowRunService } from './published-workflow-run.service.js';

function setup() {
  const findFirst = vi.fn(async () => ({ id: 'workflow-a', status: 'PUBLISHED', versions: [{ id: 'version-3' }] }));
  const create = vi.fn(async () => ({ id: 'run-1' }));
  const add = vi.fn(async () => ({ id: 'run-1' }));
  const service = new PublishedWorkflowRunService(
    { workflow: { findFirst }, workflowRun: { create, update: vi.fn(), findUnique: vi.fn() } } as never,
    { add } as never,
  );
  return { service, findFirst, create, add };
}

describe('PublishedWorkflowRunService', () => {
  it('resolves the latest project-scoped published version, creates a PUBLISHED run, and enqueues only its id', async () => {
    const { service, findFirst, create, add } = setup();
    await expect(service.createAndEnqueue({ projectId: 'project-a', workflowId: 'workflow-a', input: { name: 'Alice' } }))
      .resolves.toEqual({ id: 'run-1' });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'workflow-a', projectId: 'project-a' } }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflowId: 'workflow-a', workflowVersionId: 'version-3', source: 'PUBLISHED', status: 'PENDING' }),
    }));
    expect(add).toHaveBeenCalledWith('execute-workflow', { runId: 'run-1' }, { jobId: 'run-1', attempts: 1 });
  });

  it('does not fall back to a draft when the project-scoped workflow has no published version', async () => {
    const findFirst = vi.fn(async () => ({ id: 'workflow-a', status: 'DRAFT', versions: [] }));
    const service = new PublishedWorkflowRunService(
      { workflow: { findFirst }, workflowRun: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() } } as never,
      { add: vi.fn() } as never,
    );
    await expect(service.createAndEnqueue({ projectId: 'project-a', workflowId: 'workflow-a', input: {} }))
      .rejects.toMatchObject({ code: 'WORKFLOW_NOT_PUBLISHED' });
  });
});

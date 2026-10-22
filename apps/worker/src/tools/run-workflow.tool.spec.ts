import { RunWorkflowTool } from './run-workflow.tool.js';

describe('RunWorkflowTool', () => {
  it('creates a project-scoped published child run and returns its bounded output', async () => {
    const createAndEnqueue = vi.fn(async () => ({ id: 'child-run' }));
    const waitForTerminal = vi.fn(async () => ({ id: 'child-run', status: 'SUCCESS' as const, output: { summary: 'done' }, errorCode: null, errorMessage: null }));
    const tool = new RunWorkflowTool({ createAndEnqueue, waitForTerminal });

    await expect(tool.execute({ workflowId: 'workflow-b', input: { name: 'Alice' } }, {
      projectId: 'project-a', workflowId: 'workflow-a', workflowCallDepth: 1,
    })).resolves.toEqual({ output: { runId: 'child-run', status: 'SUCCESS', output: { summary: 'done' } }, truncated: false });
    expect(createAndEnqueue).toHaveBeenCalledWith({ projectId: 'project-a', workflowId: 'workflow-b', input: { name: 'Alice' } });
  });

  it('blocks direct recursion and calls at the depth limit before creating a run', async () => {
    const createAndEnqueue = vi.fn();
    const tool = new RunWorkflowTool({ createAndEnqueue, waitForTerminal: vi.fn() });
    await expect(tool.execute({ workflowId: 'workflow-a' }, { projectId: 'project-a', workflowId: 'workflow-a' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_TOOL_RECURSIVE_CALL' });
    await expect(tool.execute({ workflowId: 'workflow-b' }, { projectId: 'project-a', workflowCallDepth: 3 }))
      .rejects.toMatchObject({ code: 'WORKFLOW_TOOL_MAX_DEPTH_EXCEEDED' });
    expect(createAndEnqueue).not.toHaveBeenCalled();
  });

  it('maps a failed child workflow to a safe tool failure', async () => {
    const tool = new RunWorkflowTool({
      createAndEnqueue: vi.fn(async () => ({ id: 'child-run' })),
      waitForTerminal: vi.fn(async () => ({ id: 'child-run', status: 'FAILED' as const, output: null, errorCode: 'AUTH_ERROR', errorMessage: 'secret detail' })),
    });
    await expect(tool.execute({ workflowId: 'workflow-b' }, { projectId: 'project-a' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_TOOL_RUN_FAILED', message: 'Workflow execution failed' });
  });
});

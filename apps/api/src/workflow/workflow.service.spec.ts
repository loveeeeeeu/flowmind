import { BadRequestException } from '@nestjs/common';
import type { ExecutionService } from '../execution/execution.service.js';
import { WorkflowPlanService } from '../execution/workflow-plan.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from './workflow.service.js';

const validCanvas = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: { outputVariable: 'name' } },
  ],
  edges: [{ source: 'start', target: 'end' }],
};

function createService(draftCanvas: unknown) {
  const prisma = {
    workflow: {
      findUnique: vi.fn(async () => ({ id: 'workflow-1', draftCanvas })),
    },
  };
  const createRun = vi.fn(async () => ({ id: 'run-1', status: 'PENDING' }));
  const service = new WorkflowService(
    prisma as unknown as PrismaService,
    { createRun } as unknown as ExecutionService,
    new WorkflowPlanService(),
  );

  return { service, createRun };
}

describe('WorkflowService.runWorkflow', () => {
  it('enqueues a run for a valid canvas', async () => {
    const { service, createRun } = createService(validCanvas);

    await service.runWorkflow('workflow-1', { input: { name: 'FlowMind' } });

    expect(createRun).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      input: { name: 'FlowMind' },
    });
  });

  it('rejects a structurally invalid canvas without creating a run', async () => {
    const { service, createRun } = createService({
      nodes: [{ id: 'start', type: 'start', data: {} }],
      edges: [],
    });

    await expect(service.runWorkflow('workflow-1', { input: {} })).rejects.toThrow(
      new BadRequestException('Workflow must have exactly one end node'),
    );
    expect(createRun).not.toHaveBeenCalled();
  });

  it('rejects a workflow whose draft was never saved', async () => {
    const { service, createRun } = createService(null);

    await expect(service.runWorkflow('workflow-1', { input: {} })).rejects.toThrow(
      new BadRequestException('Workflow has no draft canvas'),
    );
    expect(createRun).not.toHaveBeenCalled();
  });
});

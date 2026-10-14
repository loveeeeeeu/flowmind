import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ExecutionService } from '../execution/execution.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ExternalWorkflowService } from './external-workflow.service.js';

interface WorkflowRow {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  versions: { id: string; version: number }[];
}

function setup(workflow: WorkflowRow | null) {
  const prisma = {
    workflow: { findUnique: vi.fn(async () => workflow) },
  };
  const executionService = {
    createPublishedRun: vi.fn(async () => ({
      id: 'run-1',
      source: 'PUBLISHED',
      status: 'PENDING',
      heartbeatAt: null,
    })),
    createDraftRun: vi.fn(),
  };
  const service = new ExternalWorkflowService(
    prisma as unknown as PrismaService,
    executionService as unknown as ExecutionService,
  );

  return { service, prisma, executionService };
}

const published: WorkflowRow = {
  id: 'workflow-1',
  status: 'PUBLISHED',
  versions: [{ id: 'version-3', version: 3 }],
};

describe('ExternalWorkflowService', () => {
  it('runs the latest published version and returns only the public contract', async () => {
    const { service, prisma, executionService } = setup(published);

    await expect(service.invoke('workflow-1', { name: 'FlowMind' })).resolves.toStrictEqual({
      runId: 'run-1',
      workflowId: 'workflow-1',
      version: 3,
      status: 'PENDING',
    });

    expect(prisma.workflow.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'workflow-1' },
        select: expect.objectContaining({
          versions: expect.objectContaining({ orderBy: { version: 'desc' }, take: 1 }),
        }) as unknown,
      }),
    );
    expect(executionService.createPublishedRun).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      workflowVersionId: 'version-3',
      input: { name: 'FlowMind' },
    });
    expect(executionService.createDraftRun).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown workflow', async () => {
    const { service, executionService } = setup(null);

    await expect(service.invoke('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });

  it('rejects an archived workflow even if it has versions', async () => {
    const { service, executionService } = setup({ ...published, status: 'ARCHIVED' });

    await expect(service.invoke('workflow-1', {})).rejects.toThrow(
      new BadRequestException('Archived workflow cannot be run'),
    );
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });

  it('rejects a workflow that was never published instead of running its draft', async () => {
    const { service, executionService } = setup({ ...published, status: 'DRAFT', versions: [] });

    await expect(service.invoke('workflow-1', {})).rejects.toThrow(
      new BadRequestException('Workflow has no published version'),
    );
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });
});

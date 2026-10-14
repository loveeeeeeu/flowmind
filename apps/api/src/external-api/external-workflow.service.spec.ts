import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionService } from '../execution/execution.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ExternalWorkflowService } from './external-workflow.service.js';

interface WorkflowRow {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  versions: { id: string; version: number }[];
}

const apiKey = { id: 'key-1', workflowId: 'workflow-1' };

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
  it('runs the latest published version, records the key and returns only the contract', async () => {
    const { service, prisma, executionService } = setup(published);

    await expect(
      service.invoke({ apiKey, workflowId: 'workflow-1', input: { name: 'FlowMind' } }),
    ).resolves.toStrictEqual({
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
      workflowApiKeyId: 'key-1',
      input: { name: 'FlowMind' },
    });
    expect(executionService.createDraftRun).not.toHaveBeenCalled();
  });

  it('rejects a key of another workflow before looking anything up', async () => {
    const { service, prisma, executionService } = setup(published);

    await expect(
      service.invoke({ apiKey, workflowId: 'workflow-2', input: {} }),
    ).rejects.toThrow(new ForbiddenException('API key cannot access this workflow'));
    expect(prisma.workflow.findUnique).not.toHaveBeenCalled();
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });

  it('returns 404 when the key outlived its workflow', async () => {
    const { service, executionService } = setup(null);

    await expect(
      service.invoke({ apiKey, workflowId: 'workflow-1', input: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });

  it('rejects an archived workflow even if it has versions', async () => {
    const { service, executionService } = setup({ ...published, status: 'ARCHIVED' });

    await expect(
      service.invoke({ apiKey, workflowId: 'workflow-1', input: {} }),
    ).rejects.toThrow(new BadRequestException('Archived workflow cannot be run'));
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });

  it('rejects a workflow that was never published instead of running its draft', async () => {
    const { service, executionService } = setup({ ...published, status: 'DRAFT', versions: [] });

    await expect(
      service.invoke({ apiKey, workflowId: 'workflow-1', input: {} }),
    ).rejects.toThrow(new BadRequestException('Workflow has no published version'));
    expect(executionService.createPublishedRun).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import type { ExecutionService } from '../execution/execution.service.js';
import { WorkflowPlanService } from '../execution/workflow-plan.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { WorkflowVersionService } from './workflow-version.service.js';
import { WorkflowService } from './workflow.service.js';

const validCanvas = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: { outputVariable: 'name' } },
  ],
  edges: [{ source: 'start', target: 'end' }],
};

interface SetupOptions {
  draftCanvas?: unknown;
  status?: string;
  latestVersion?: { id: string; version: number } | null;
}

function createService({
  draftCanvas = validCanvas,
  status = 'DRAFT',
  latestVersion = null,
}: SetupOptions = {}) {
  const prisma = {
    workflow: {
      findUnique: vi.fn(async () => ({ id: 'workflow-1', status, draftCanvas })),
    },
  };
  const createRun = vi.fn(async () => ({ id: 'run-1', status: 'PENDING' }));
  const versions = {
    publish: vi.fn(async () => ({ id: 'version-1', workflowId: 'workflow-1', version: 1 })),
    findLatest: vi.fn(async () => latestVersion),
  };
  const service = new WorkflowService(
    prisma as unknown as PrismaService,
    { createRun } as unknown as ExecutionService,
    new WorkflowPlanService(),
    versions as unknown as WorkflowVersionService,
  );

  return { service, createRun, versions };
}

describe('WorkflowService.publish', () => {
  it('publishes the saved draft canvas as a new version', async () => {
    const { service, versions } = createService();

    await expect(service.publish('workflow-1')).resolves.toMatchObject({ version: 1 });
    expect(versions.publish).toHaveBeenCalledWith('workflow-1', validCanvas);
  });

  it('rejects a structurally invalid draft without creating a version', async () => {
    const { service, versions } = createService({
      draftCanvas: { nodes: [{ id: 'start', type: 'start', data: {} }], edges: [] },
    });

    await expect(service.publish('workflow-1')).rejects.toThrow(
      new BadRequestException('Workflow must have exactly one end node'),
    );
    expect(versions.publish).not.toHaveBeenCalled();
  });

  it('rejects an unsupported node type at publish time', async () => {
    const { service, versions } = createService({
      draftCanvas: {
        nodes: [
          { id: 'start', type: 'start', data: {} },
          { id: 'magic', type: 'magic', data: {} },
          { id: 'end', type: 'end', data: {} },
        ],
        edges: [
          { source: 'start', target: 'magic' },
          { source: 'magic', target: 'end' },
        ],
      },
    });

    await expect(service.publish('workflow-1')).rejects.toThrow(
      new BadRequestException('Unsupported node type: magic'),
    );
    expect(versions.publish).not.toHaveBeenCalled();
  });

  it('rejects a workflow whose draft was never saved', async () => {
    const { service, versions } = createService({ draftCanvas: null });

    await expect(service.publish('workflow-1')).rejects.toThrow(
      new BadRequestException('Workflow has no draft canvas'),
    );
    expect(versions.publish).not.toHaveBeenCalled();
  });

  it('rejects an archived workflow', async () => {
    const { service, versions } = createService({ status: 'ARCHIVED' });

    await expect(service.publish('workflow-1')).rejects.toThrow(
      new BadRequestException('Archived workflow cannot be published'),
    );
    expect(versions.publish).not.toHaveBeenCalled();
  });
});

describe('WorkflowService.runWorkflow', () => {
  it('binds the run to the latest published version', async () => {
    const { service, createRun } = createService({
      status: 'PUBLISHED',
      latestVersion: { id: 'version-2', version: 2 },
    });

    await service.runWorkflow('workflow-1', { input: { name: 'FlowMind' } });

    expect(createRun).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      workflowVersionId: 'version-2',
      input: { name: 'FlowMind' },
    });
  });

  it('never runs the draft: no published version means 400', async () => {
    const { service, createRun } = createService({ latestVersion: null });

    await expect(service.runWorkflow('workflow-1', { input: {} })).rejects.toThrow(
      new BadRequestException('Workflow has no published version'),
    );
    expect(createRun).not.toHaveBeenCalled();
  });

  it('runs the published version even when the current draft is invalid', async () => {
    const { service, createRun } = createService({
      draftCanvas: { nodes: [], edges: [] },
      latestVersion: { id: 'version-1', version: 1 },
    });

    await service.runWorkflow('workflow-1', { input: {} });

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ workflowVersionId: 'version-1' }),
    );
  });

  it('rejects running an archived workflow', async () => {
    const { service, createRun } = createService({
      status: 'ARCHIVED',
      latestVersion: { id: 'version-1', version: 1 },
    });

    await expect(service.runWorkflow('workflow-1', { input: {} })).rejects.toThrow(
      new BadRequestException('Archived workflow cannot be run'),
    );
    expect(createRun).not.toHaveBeenCalled();
  });
});

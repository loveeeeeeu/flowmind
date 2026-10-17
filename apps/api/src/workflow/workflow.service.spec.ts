import { apiError } from '../common/api-error.js';
import type { ExecutionService } from '../execution/execution.service.js';
import { WorkflowPlanService } from '../execution/workflow-plan.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { WorkflowResourceValidator } from './workflow-resource-validator.service.js';
import type { WorkflowVersionService } from './workflow-version.service.js';
import { WorkflowService } from './workflow.service.js';

const validCanvas = {
  nodes: [
    { id: 'start', type: 'start', data: {} },
    { id: 'end', type: 'end', data: { outputVariable: 'name' } },
  ],
  edges: [{ source: 'start', target: 'end' }],
};

const invalidCanvas = { nodes: [{ id: 'start', type: 'start', data: {} }], edges: [] };

interface SetupOptions {
  draftCanvas?: unknown;
  draftRevision?: number;
  status?: string;
  latestVersion?: { id: string; version: number } | null;
}

function createService({
  draftCanvas = validCanvas,
  draftRevision = 3,
  status = 'DRAFT',
  latestVersion = null,
}: SetupOptions = {}) {
  const prisma = {
    workflow: {
      findFirst: vi.fn(async () => ({ id: 'workflow-1', status, draftCanvas, draftRevision })),
      update: vi.fn(async () => ({ id: 'workflow-1' })),
    },
  };
  const execution = {
    createPublishedRun: vi.fn(async () => ({ id: 'run-1', source: 'PUBLISHED' })),
    createDraftRun: vi.fn(async () => ({ id: 'run-2', source: 'DRAFT' })),
  };
  const versions = {
    publishValidatedDraft: vi.fn(async () => ({ id: 'version-1', version: 1 })),
    findLatest: vi.fn(async () => latestVersion),
  };
  const resources = { validateForDraft: vi.fn(async () => undefined) };
  const service = new WorkflowService(
    prisma as unknown as PrismaService,
    execution as unknown as ExecutionService,
    new WorkflowPlanService(),
    versions as unknown as WorkflowVersionService,
    resources as unknown as WorkflowResourceValidator,
  );

  return { service, prisma, execution, versions, resources };
}

const modelDisabled = apiError.badRequest('MODEL_DISABLED', 'LLM node llm uses a disabled model; select another model');

describe('WorkflowService.updateCanvas', () => {
  it('saves the draft and bumps its revision', async () => {
    const { service, prisma } = createService();

    await service.updateCanvas('project-1', 'workflow-1', validCanvas);

    expect(prisma.workflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: { draftCanvas: validCanvas, draftRevision: { increment: 1 } },
    });
  });

  it('returns WORKFLOW_NOT_FOUND for an unknown workflow', async () => {
    const { service, prisma } = createService();
    prisma.workflow.findFirst.mockResolvedValueOnce(null as never);

    await expect(service.updateCanvas('project-1', 'missing', validCanvas)).rejects.toThrow(
      apiError.notFound('WORKFLOW_NOT_FOUND', 'Workflow missing not found'),
    );
  });
});

describe('WorkflowService.publish', () => {
  it('publishes the validated draft together with the revision it was read at', async () => {
    const { service, versions, prisma } = createService({ draftRevision: 4 });

    await service.publish('project-1', 'workflow-1');

    expect(versions.publishValidatedDraft).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      canvas: validCanvas,
      expectedDraftRevision: 4,
    });
    // Publishing reads the draft; only saving bumps draftRevision.
    expect(prisma.workflow.update).not.toHaveBeenCalled();
  });

  it('rejects a structurally invalid draft without checking resources or creating a version', async () => {
    const { service, versions, resources } = createService({ draftCanvas: invalidCanvas });

    await expect(service.publish('project-1', 'workflow-1')).rejects.toThrow(
      apiError.badRequest('WORKFLOW_INVALID', 'Workflow must have exactly one end node'),
    );
    expect(resources.validateForDraft).not.toHaveBeenCalled();
    expect(versions.publishValidatedDraft).not.toHaveBeenCalled();
  });

  it('checks referenced resources and creates no version when one is unusable', async () => {
    const { service, versions, resources } = createService();
    resources.validateForDraft.mockRejectedValueOnce(modelDisabled);

    await expect(service.publish('project-1', 'workflow-1')).rejects.toThrow(modelDisabled);
    expect(resources.validateForDraft).toHaveBeenCalledWith('project-1', validCanvas);
    expect(versions.publishValidatedDraft).not.toHaveBeenCalled();
  });

  it('rejects a workflow whose draft was never saved', async () => {
    const { service, versions } = createService({ draftCanvas: null });

    await expect(service.publish('project-1', 'workflow-1')).rejects.toThrow(
      apiError.badRequest('WORKFLOW_DRAFT_MISSING', 'Workflow has no draft canvas'),
    );
    expect(versions.publishValidatedDraft).not.toHaveBeenCalled();
  });

  it('rejects an archived workflow', async () => {
    const { service, versions } = createService({ status: 'ARCHIVED' });

    await expect(service.publish('project-1', 'workflow-1')).rejects.toThrow(
      apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be published'),
    );
    expect(versions.publishValidatedDraft).not.toHaveBeenCalled();
  });
});

describe('WorkflowService.testRun', () => {
  it('creates a DRAFT run from the submitted (possibly unsaved) canvas, not the saved draft', async () => {
    const unsaved = {
      ...validCanvas,
      nodes: [...validCanvas.nodes, { id: 'tpl', type: 'template', data: {} }],
      edges: [
        { source: 'start', target: 'tpl' },
        { source: 'tpl', target: 'end' },
      ],
    };
    const { service, execution, versions, prisma } = createService({ draftCanvas: null });

    await service.testRun('project-1', 'workflow-1', { input: { name: 'A' }, canvas: unsaved });

    expect(execution.createDraftRun).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      canvas: unsaved,
      input: { name: 'A' },
    });
    // Testing never publishes and never saves the draft (so draftRevision stays put).
    expect(versions.publishValidatedDraft).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(execution.createPublishedRun).not.toHaveBeenCalled();
  });

  it('validates the canvas before queuing anything', async () => {
    const { service, execution } = createService();

    await expect(
      service.testRun('project-1', 'workflow-1', { input: {}, canvas: invalidCanvas }),
    ).rejects.toThrow(
      apiError.badRequest('WORKFLOW_INVALID', 'Workflow must have exactly one end node'),
    );
    expect(execution.createDraftRun).not.toHaveBeenCalled();
  });

  it('checks referenced resources before queuing, so a disabled model fails fast', async () => {
    const { service, execution, resources } = createService();
    resources.validateForDraft.mockRejectedValueOnce(modelDisabled);

    await expect(service.testRun('project-1', 'workflow-1', { input: {}, canvas: validCanvas })).rejects.toThrow(
      modelDisabled,
    );
    expect(resources.validateForDraft).toHaveBeenCalledWith('project-1', validCanvas);
    expect(execution.createDraftRun).not.toHaveBeenCalled();
  });

  it('rejects testing an archived workflow', async () => {
    const { service, execution } = createService({ status: 'ARCHIVED' });

    await expect(
      service.testRun('project-1', 'workflow-1', { input: {}, canvas: validCanvas }),
    ).rejects.toThrow(apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be tested'));
    expect(execution.createDraftRun).not.toHaveBeenCalled();
  });
});

describe('WorkflowService.runWorkflow', () => {
  it('creates a PUBLISHED run bound to the latest version', async () => {
    const { service, execution, prisma } = createService({
      status: 'PUBLISHED',
      latestVersion: { id: 'version-2', version: 2 },
    });

    await service.runWorkflow('project-1', 'workflow-1', { input: { name: 'FlowMind' } });

    expect(execution.createPublishedRun).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      workflowVersionId: 'version-2',
      input: { name: 'FlowMind' },
    });
    expect(prisma.workflow.update).not.toHaveBeenCalled();
  });

  it('never runs the draft: no published version means WORKFLOW_NOT_PUBLISHED', async () => {
    const { service, execution } = createService({ latestVersion: null });

    await expect(service.runWorkflow('project-1', 'workflow-1', { input: {} })).rejects.toThrow(
      apiError.badRequest('WORKFLOW_NOT_PUBLISHED', 'Workflow has no published version'),
    );
    expect(execution.createPublishedRun).not.toHaveBeenCalled();
  });

  it('runs the published version even when the current draft is invalid', async () => {
    const { service, execution } = createService({
      draftCanvas: { nodes: [], edges: [] },
      latestVersion: { id: 'version-1', version: 1 },
    });

    await service.runWorkflow('project-1', 'workflow-1', { input: {} });

    expect(execution.createPublishedRun).toHaveBeenCalledWith(
      expect.objectContaining({ workflowVersionId: 'version-1' }),
    );
  });

  it('rejects running an archived workflow', async () => {
    const { service, execution } = createService({
      status: 'ARCHIVED',
      latestVersion: { id: 'version-1', version: 1 },
    });

    await expect(service.runWorkflow('project-1', 'workflow-1', { input: {} })).rejects.toThrow(
      apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be run'),
    );
    expect(execution.createPublishedRun).not.toHaveBeenCalled();
  });
});

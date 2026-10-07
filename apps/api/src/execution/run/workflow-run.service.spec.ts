import type { PrismaService } from '../../prisma/prisma.service.js';
import { LlmProviderError } from '../../llm/errors/llm-provider.error.js';
import { WorkflowRunService } from './workflow-run.service.js';

function createPrisma() {
  return {
    workflowRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => undefined),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  };
}

describe('WorkflowRunService', () => {
  it('creates a pending run and snapshots its input as JSON', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.create('workflow-1', { topic: 'AI', omit: undefined });

    expect(prisma.workflowRun.create).toHaveBeenCalledWith({
      data: {
        workflowId: 'workflow-1',
        status: 'PENDING',
        input: { topic: 'AI' },
      },
    });
  });

  it('persists a provider error code when a run fails', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);
    const error = new LlmProviderError({
      providerId: 'openai',
      code: 'RATE_LIMIT',
      message: 'Too many requests',
    });

    await service.markFailed('run-1', error);

    expect(prisma.workflowRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED',
        errorCode: 'RATE_LIMIT',
        errorMessage: 'Too many requests',
        finishedAt: expect.any(Date),
      },
    });
  });

  it('loads node runs in their execution sequence', async () => {
    const prisma = createPrisma();
    const service = new WorkflowRunService(prisma as unknown as PrismaService);

    await service.findOne('run-1');

    expect(prisma.workflowRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      include: { nodeRuns: { orderBy: { sequence: 'asc' } } },
    });
  });
});

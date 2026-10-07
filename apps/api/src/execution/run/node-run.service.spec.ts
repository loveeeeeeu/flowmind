import { LlmProviderError } from '../../llm/errors/llm-provider.error.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { NodeRunService } from './node-run.service.js';

function createPrisma() {
  return {
    nodeRun: {
      create: vi.fn(async () => ({ id: 'node-run-1' })),
      update: vi.fn(async () => undefined),
    },
  };
}

describe('NodeRunService', () => {
  it('starts a node run with its sequence and default attempt', async () => {
    const prisma = createPrisma();
    const service = new NodeRunService(prisma as unknown as PrismaService);

    await service.create({
      workflowRunId: 'run-1',
      nodeId: 'template',
      nodeType: 'template',
      sequence: 2,
    });

    expect(prisma.nodeRun.create).toHaveBeenCalledWith({
      data: {
        workflowRunId: 'run-1',
        nodeId: 'template',
        nodeType: 'template',
        sequence: 2,
        iteration: undefined,
        attempt: 1,
        status: 'RUNNING',
        startedAt: expect.any(Date),
      },
    });
  });

  it('sanitizes an output snapshot and retains its failure code', async () => {
    const prisma = createPrisma();
    const service = new NodeRunService(prisma as unknown as PrismaService);

    await service.markSuccess('node-run-1', {
      text: 'done',
      usage: { promptTokens: undefined, totalTokens: 3 },
    });
    await service.markFailed(
      'node-run-1',
      new LlmProviderError({
        providerId: 'openai',
        code: 'TIMEOUT',
        message: 'Provider timed out',
      }),
    );

    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'node-run-1' },
      data: {
        status: 'SUCCESS',
        output: { text: 'done', usage: { totalTokens: 3 } },
        finishedAt: expect.any(Date),
      },
    });
    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'node-run-1' },
      data: {
        status: 'FAILED',
        errorCode: 'TIMEOUT',
        errorMessage: 'Provider timed out',
        finishedAt: expect.any(Date),
      },
    });
  });
});

import type { WorkflowNode } from '@flowmind/workflow-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';

function createPrisma() {
  let created = 0;

  return {
    nodeRun: {
      create: vi.fn(async () => ({ id: `node-run-${created++}` })),
      update: vi.fn(async () => undefined),
    },
  };
}

const body: WorkflowNode = { id: 'body', type: 'template', data: {} };

describe('PrismaExecutionObserver', () => {
  it('creates a running node run and completes the matching one by sequence', async () => {
    const prisma = createPrisma();
    const observer = new PrismaExecutionObserver(prisma as unknown as PrismaService, 'run-1');

    // The same node twice, as inside a loop body.
    await observer.onNodeStart({ node: body, sequence: 2 });
    await observer.onNodeSuccess({ node: body, sequence: 2, output: 'first' });
    await observer.onNodeStart({ node: body, sequence: 4 });
    await observer.onNodeSuccess({ node: body, sequence: 4, output: 'second' });

    expect(prisma.nodeRun.create).toHaveBeenNthCalledWith(1, {
      data: {
        workflowRunId: 'run-1',
        nodeId: 'body',
        nodeType: 'template',
        sequence: 2,
        status: 'RUNNING',
        startedAt: expect.any(Date),
      },
    });
    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'node-run-0' },
      data: { status: 'SUCCESS', output: 'first', finishedAt: expect.any(Date) },
    });
    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'node-run-1' },
      data: { status: 'SUCCESS', output: 'second', finishedAt: expect.any(Date) },
    });
  });

  it('records error code and message on failure', async () => {
    const prisma = createPrisma();
    const observer = new PrismaExecutionObserver(prisma as unknown as PrismaService, 'run-1');

    await observer.onNodeStart({ node: body, sequence: 0 });
    await observer.onNodeFailure({ node: body, sequence: 0, error: new Error('boom') });

    expect(prisma.nodeRun.update).toHaveBeenCalledWith({
      where: { id: 'node-run-0' },
      data: {
        status: 'FAILED',
        errorCode: 'NODE_EXECUTION_ERROR',
        errorMessage: 'boom',
        finishedAt: expect.any(Date),
      },
    });
  });
});

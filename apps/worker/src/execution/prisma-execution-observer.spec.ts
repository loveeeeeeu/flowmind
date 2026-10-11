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
const llm: WorkflowNode = { id: 'llm', type: 'llm', data: {} };

describe('PrismaExecutionObserver', () => {
  it('creates a running node run and completes the matching one by sequence', async () => {
    const prisma = createPrisma();
    const observer = new PrismaExecutionObserver(prisma as unknown as PrismaService, 'run-1');

    // The same node twice, as inside a loop body.
    await observer.onNodeStart({ node: body, sequence: 2, attempt: 1 });
    await observer.onNodeSuccess({ node: body, sequence: 2, attempt: 1, output: 'first' });
    await observer.onNodeStart({ node: body, sequence: 4, attempt: 1 });
    await observer.onNodeSuccess({ node: body, sequence: 4, attempt: 1, output: 'second' });

    expect(prisma.nodeRun.create).toHaveBeenNthCalledWith(1, {
      data: {
        workflowRunId: 'run-1',
        nodeId: 'body',
        nodeType: 'template',
        sequence: 2,
        attempt: 1,
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

  it('records each retry attempt of the same step as its own node run', async () => {
    const prisma = createPrisma();
    const observer = new PrismaExecutionObserver(prisma as unknown as PrismaService, 'run-1');
    const rateLimit = Object.assign(new Error('Rate limit'), { code: 'RATE_LIMIT' });

    await observer.onNodeStart({ node: llm, sequence: 2, attempt: 1 });
    await observer.onNodeFailure({
      node: llm,
      sequence: 2,
      attempt: 1,
      error: rateLimit,
      willRetry: true,
    });
    await observer.onNodeStart({ node: llm, sequence: 2, attempt: 2 });
    await observer.onNodeSuccess({ node: llm, sequence: 2, attempt: 2, output: 'ok' });

    expect(prisma.nodeRun.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ sequence: 2, attempt: 2 }) }),
    );
    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'node-run-0' },
      data: {
        status: 'FAILED',
        errorCode: 'RATE_LIMIT',
        errorMessage: 'Rate limit',
        finishedAt: expect.any(Date),
      },
    });
    expect(prisma.nodeRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'node-run-1' },
      data: { status: 'SUCCESS', output: 'ok', finishedAt: expect.any(Date) },
    });
  });

  it('records error code and message on failure', async () => {
    const prisma = createPrisma();
    const observer = new PrismaExecutionObserver(prisma as unknown as PrismaService, 'run-1');

    await observer.onNodeStart({ node: body, sequence: 0, attempt: 1 });
    await observer.onNodeFailure({
      node: body,
      sequence: 0,
      attempt: 1,
      error: new Error('boom'),
      willRetry: false,
    });

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

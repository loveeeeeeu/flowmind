import type { WorkflowNode } from '@flowmind/workflow-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
import type { RunEventPublisher } from '../execution-events/run-event-publisher.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';

const modelRow = { modelName: 'deepseek-chat', credentialId: 'cred-1', credential: { provider: 'DEEPSEEK' } };

function setup(model: unknown = modelRow) {
  let created = 0;
  const prisma = {
    nodeRun: {
      create: vi.fn(async () => ({ id: `node-run-${created++}` })),
      update: vi.fn(async () => undefined),
    },
    model: { findUnique: vi.fn(async () => model) },
  };
  const logs = { log: vi.fn(async () => undefined) };
  const events = { publish: vi.fn(async () => 1) };
  const observer = new PrismaExecutionObserver(
    prisma as unknown as PrismaService,
    logs as unknown as ExecutionLogService,
    'run-1',
    events as unknown as RunEventPublisher,
  );

  return { prisma, logs, events, observer };
}

const body: WorkflowNode = { id: 'body', type: 'template', data: { template: 'secret {{x}}' } };
const llm: WorkflowNode = {
  id: 'llm',
  type: 'llm',
  data: { modelId: 'model-1', prompt: 'private user text' },
};

describe('PrismaExecutionObserver', () => {
  it('creates a running node run and completes the matching one by sequence', async () => {
    const { prisma, events, observer } = setup();

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
        input: { nodeType: 'template', config: { template: 'secret {{x}}' } },
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
    expect(events.publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: 'run-1',
        type: 'NODE_STATUS_CHANGED',
        nodeRunId: 'node-run-0',
        status: 'RUNNING',
        startedAt: expect.any(String),
        finishedAt: null,
        error: null,
      }),
    );
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodeRunId: 'node-run-1',
        status: 'SUCCESS',
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        error: null,
      }),
    );
  });

  it('keeps persisted node execution successful when Redis notification fails', async () => {
    const { prisma, events, observer } = setup();
    events.publish.mockRejectedValueOnce(new Error('Redis unavailable'));

    await observer.onNodeStart({ node: body, sequence: 1, attempt: 1 });
    await expect(
      observer.onNodeSuccess({ node: body, sequence: 1, attempt: 1, output: 'saved' }),
    ).resolves.toBeUndefined();

    expect(prisma.nodeRun.update).toHaveBeenCalledWith({
      where: { id: 'node-run-0' },
      data: { status: 'SUCCESS', output: 'saved', finishedAt: expect.any(Date) },
    });
  });

  it('logs node start with safe node and model facts only, linked to its node run', async () => {
    const { prisma, logs, observer } = setup();

    await observer.onNodeStart({ node: llm, sequence: 1, attempt: 1 });

    expect(logs.log).toHaveBeenCalledWith({
      workflowRunId: 'run-1',
      nodeRunId: 'node-run-0',
      message: '节点开始执行',
      metadata: {
        nodeId: 'llm',
        nodeType: 'llm',
        sequence: 1,
        attempt: 1,
        modelId: 'model-1',
        modelName: 'deepseek-chat',
        provider: 'DEEPSEEK',
        credentialId: 'cred-1',
      },
    });
    expect(JSON.stringify(logs.log.mock.calls)).not.toContain('private user text');
    // Metadata only: the secret columns are never even read.
    expect(JSON.stringify(prisma.model.findUnique.mock.calls)).not.toMatch(/secret/i);
  });

  it('still logs the modelId when the model lookup finds nothing or fails', async () => {
    const missing = setup(null);
    await missing.observer.onNodeStart({ node: llm, sequence: 1, attempt: 1 });

    const failing = setup();
    failing.prisma.model.findUnique.mockRejectedValueOnce(new Error('db down'));
    await failing.observer.onNodeStart({ node: llm, sequence: 1, attempt: 1 });

    for (const { logs } of [missing, failing]) {
      expect(logs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { nodeId: 'llm', nodeType: 'llm', sequence: 1, attempt: 1, modelId: 'model-1' },
        }),
      );
    }
  });

  it('records each retry attempt as its own node run, WARN while retrying, INFO on success', async () => {
    const { prisma, logs, observer } = setup();
    const rateLimit = Object.assign(new Error('Rate limit'), { code: 'RATE_LIMIT', retryable: true });

    await observer.onNodeStart({ node: llm, sequence: 2, attempt: 1 });
    await observer.onNodeFailure({
      node: llm,
      sequence: 2,
      attempt: 1,
      error: rateLimit,
      willRetry: true,
      retryDelayMs: 500,
    });
    await observer.onNodeStart({ node: llm, sequence: 2, attempt: 2 });
    await observer.onNodeSuccess({ node: llm, sequence: 2, attempt: 2, output: 'ok' });

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
    expect(logs.log).toHaveBeenCalledWith({
      workflowRunId: 'run-1',
      nodeRunId: 'node-run-0',
      level: 'WARN',
      message: '节点执行失败，500ms 后重试',
      metadata: {
        nodeId: 'llm',
        sequence: 2,
        attempt: 1,
        code: 'RATE_LIMIT',
        retryable: true,
        willRetry: true,
        retryDelayMs: 500,
      },
    });
    expect(logs.log).toHaveBeenLastCalledWith({
      workflowRunId: 'run-1',
      nodeRunId: 'node-run-1',
      message: '节点执行成功',
      metadata: { nodeId: 'llm', sequence: 2, attempt: 2 },
    });
  });

  it('records the final failure as ERROR', async () => {
    const { prisma, logs, observer } = setup();

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
    expect(logs.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: '节点执行失败',
        metadata: expect.objectContaining({ code: 'NODE_EXECUTION_ERROR', willRetry: false }),
      }),
    );
  });
});

import type { PrismaService } from '../prisma/prisma.service.js';
import type { RunEventPublisher } from '../execution-events/run-event-publisher.service.js';
import { ExecutionLogService } from './execution-log.service.js';

function createService(create: ReturnType<typeof vi.fn>, publish = vi.fn(async () => 1)) {
  return {
    publish,
    service: new ExecutionLogService(
      { executionLog: { create } } as unknown as PrismaService,
      { publish } as unknown as RunEventPublisher,
    ),
  };
}

describe('ExecutionLogService', () => {
  it('writes an INFO log by default with JSON metadata', async () => {
    const create = vi.fn(async () => ({
      id: 'log-1',
      level: 'INFO',
      nodeRunId: 'node-run-1',
      message: '节点开始执行',
      metadata: { nodeId: 'llm', authorization: 'secret' },
      createdAt: new Date('2026-10-19T10:00:00.000Z'),
    }));
    const { service, publish } = createService(create);

    await service.log({
      workflowRunId: 'run-1',
      nodeRunId: 'node-run-1',
      message: '节点开始执行',
      metadata: { nodeId: 'llm', attempt: 1, dropped: undefined },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        workflowRunId: 'run-1',
        nodeRunId: 'node-run-1',
        level: 'INFO',
        message: '节点开始执行',
        metadata: { nodeId: 'llm', attempt: 1 },
      },
    });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        type: 'LOG_APPENDED',
        log: expect.objectContaining({ metadata: { nodeId: 'llm', authorization: '[REDACTED]' } as unknown }),
      }),
    );
  });

  it('never throws when the insert fails: logging failure is not execution failure', async () => {
    const create = vi.fn(async () => {
      throw new Error('connection reset');
    });

    await expect(
      createService(create).service.log({ workflowRunId: 'run-1', level: 'ERROR', message: '运行失败' }),
    ).resolves.toBeUndefined();
  });

  it('keeps a persisted log when Redis publishing fails', async () => {
    const create = vi.fn(async () => ({
      id: 'log-1', level: 'INFO', nodeRunId: null, message: 'saved', metadata: null, createdAt: new Date(),
    }));
    const publish = vi.fn(async () => { throw new Error('Redis unavailable'); });

    await expect(createService(create, publish).service.log({ workflowRunId: 'run-1', message: 'saved' })).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

import type { PrismaService } from '../prisma/prisma.service.js';
import { ExecutionLogService } from './execution-log.service.js';

function createService(create: ReturnType<typeof vi.fn>) {
  return new ExecutionLogService({ executionLog: { create } } as unknown as PrismaService);
}

describe('ExecutionLogService', () => {
  it('writes an INFO log by default with JSON metadata', async () => {
    const create = vi.fn(async () => undefined);

    await createService(create).log({
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
  });

  it('never throws when the insert fails: logging failure is not execution failure', async () => {
    const create = vi.fn(async () => {
      throw new Error('connection reset');
    });

    await expect(
      createService(create).log({ workflowRunId: 'run-1', level: 'ERROR', message: '运行失败' }),
    ).resolves.toBeUndefined();
  });
});

import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service.js';

const redisInstances = vi.hoisted(() => [] as Array<{
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}>);

vi.mock('ioredis', () => ({
  Redis: class {
    on = vi.fn();
    off = vi.fn();
    subscribe = vi.fn(async () => 1);
    unsubscribe = vi.fn(async () => 1);
    quit = vi.fn(async () => 'OK');

    constructor() {
      redisInstances.push(this);
    }
  },
}));

import { RunEventStreamService } from './run-event-stream.service.js';

describe('RunEventStreamService cleanup', () => {
  it('unsubscribes and quits its dedicated Redis subscriber when the SSE client disconnects', async () => {
    redisInstances.splice(0);
    const prisma = {
      workflowRun: {
        findFirst: vi.fn(async () => ({
          id: 'run-1',
          status: 'RUNNING',
          output: null,
          errorCode: null,
          errorMessage: null,
        })),
      },
    };
    const service = new RunEventStreamService(
      prisma as unknown as PrismaService,
      { get: vi.fn() } as unknown as ConfigService,
    );

    const events = await service.stream('project-1', 'run-1');
    const subscription = events.subscribe();
    await Promise.resolve();

    const redis = redisInstances[0]!;
    subscription.unsubscribe();
    await Promise.resolve();
    await Promise.resolve();

    expect(redis.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(redis.unsubscribe).toHaveBeenCalledWith('flowmind:run:run-1:events');
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});

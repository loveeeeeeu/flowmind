import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { RunEventStreamService } from './run-event-stream.service.js';

function createPrisma(run: unknown = null) {
  return { workflowRun: { findFirst: vi.fn(async () => run) } };
}

describe('RunEventStreamService', () => {
  it('loads a snapshot only when the run belongs to the requested project', async () => {
    const prisma = createPrisma({
      id: 'run-a',
      status: 'RUNNING',
      output: null,
      errorCode: null,
      errorMessage: null,
    });
    const service = new RunEventStreamService(
      prisma as unknown as PrismaService,
      { get: vi.fn() } as unknown as ConfigService,
    );

    await expect(service.ensureRunAccessible('project-a', 'run-a')).resolves.toMatchObject({ id: 'run-a' });
    expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-a', workflow: { projectId: 'project-a' } },
      select: {
        id: true,
        status: true,
        output: true,
        errorCode: true,
        errorMessage: true,
      },
    });
  });

  it('does not reveal a run from another project', async () => {
    const service = new RunEventStreamService(
      createPrisma() as unknown as PrismaService,
      { get: vi.fn() } as unknown as ConfigService,
    );

    await expect(service.ensureRunAccessible('project-a', 'run-b')).rejects.toMatchObject({ status: 404 });
  });
});

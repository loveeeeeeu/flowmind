import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ExternalRunService } from './external-run.service.js';

const createdAt = new Date('2026-10-14T04:00:00.000Z');
const startedAt = new Date('2026-10-14T04:00:01.000Z');
const finishedAt = new Date('2026-10-14T04:00:02.000Z');

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    workflowId: 'workflow-1',
    status: 'SUCCESS',
    output: { result: 'Hello' },
    errorCode: null,
    errorMessage: null,
    createdAt,
    startedAt,
    finishedAt,
    workflowVersion: { version: 3 },
    ...overrides,
  };
}

function setup(row: ReturnType<typeof runRow> | null) {
  const prisma = { workflowRun: { findFirst: vi.fn(async () => row) } };
  const service = new ExternalRunService(prisma as unknown as PrismaService);

  return { service, prisma };
}

describe('ExternalRunService', () => {
  it('returns the output of a successful run and nothing internal', async () => {
    const { service, prisma } = setup(runRow());

    await expect(service.findOne('run-1')).resolves.toStrictEqual({
      runId: 'run-1',
      workflowId: 'workflow-1',
      version: 3,
      status: 'SUCCESS',
      output: { result: 'Hello' },
      error: null,
      createdAt,
      startedAt,
      finishedAt,
    });

    const [[args]] = prisma.workflowRun.findFirst.mock.calls as unknown as [
      [{ where: unknown; select: Record<string, unknown> }],
    ];
    expect(args.where).toEqual({ id: 'run-1', source: 'PUBLISHED' });
    for (const internal of ['nodeRuns', 'logs', 'draftSnapshot', 'heartbeatAt', 'input']) {
      expect(args.select).not.toHaveProperty(internal);
    }
  });

  it.each(['PENDING', 'RUNNING'])('has no output and no error while %s', async (status) => {
    const { service } = setup(
      runRow({ status, output: null, startedAt: status === 'RUNNING' ? startedAt : null }),
    );

    await expect(service.findOne('run-1')).resolves.toMatchObject({
      status,
      output: null,
      error: null,
    });
  });

  it('returns a stable error object for a failed run and hides partial output', async () => {
    const { service } = setup(
      runRow({
        status: 'FAILED',
        output: { partial: true },
        errorCode: 'RATE_LIMIT',
        errorMessage: 'LLM provider rate limit exceeded',
      }),
    );

    await expect(service.findOne('run-1')).resolves.toMatchObject({
      status: 'FAILED',
      output: null,
      error: { code: 'RATE_LIMIT', message: 'LLM provider rate limit exceeded' },
    });
  });

  it('falls back to a generic error when a failed run has no code or message', async () => {
    const { service } = setup(runRow({ status: 'FAILED', output: null }));

    await expect(service.findOne('run-1')).resolves.toMatchObject({
      error: { code: 'EXECUTION_ERROR', message: 'Workflow execution failed' },
    });
  });

  it('reports a null version for legacy runs created before versioning', async () => {
    const { service } = setup(runRow({ workflowVersion: null }));

    await expect(service.findOne('run-1')).resolves.toMatchObject({ version: null });
  });

  it('returns 404 for unknown runs and for draft test runs', async () => {
    const { service } = setup(null);

    await expect(service.findOne('draft-run')).rejects.toBeInstanceOf(NotFoundException);
  });
});

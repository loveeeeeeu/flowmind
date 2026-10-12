import type { ExecutionObserver, WorkflowEngine } from '@flowmind/workflow-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';
import type { RunExecutionDecision, RunStateService } from './run-state.service.js';
import { WorkflowExecutionService } from './workflow-execution.service.js';

const canvas = { nodes: [], edges: [] };
const run = {
  id: 'run-1',
  status: 'PENDING',
  heartbeatAt: null,
  input: { name: 'FlowMind' },
  workflow: { draftCanvas: canvas },
};

function createRunState(decision: RunExecutionDecision = 'execute') {
  const stopHeartbeat = vi.fn();

  return {
    stopHeartbeat,
    runState: {
      findRun: vi.fn(async () => run),
      prepareForExecution: vi.fn(async () => decision),
      startHeartbeat: vi.fn(() => stopHeartbeat),
      markSuccess: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
    },
  };
}

function createService(
  runState: ReturnType<typeof createRunState>['runState'],
  execute: ReturnType<typeof vi.fn>,
) {
  return new WorkflowExecutionService(
    {} as PrismaService,
    { execute } as unknown as WorkflowEngine,
    runState as unknown as RunStateService,
    { log: vi.fn(async () => undefined) } as unknown as ExecutionLogService,
  );
}

describe('WorkflowExecutionService', () => {
  it('executes a claimed run with an observer, then marks it successful and stops the heartbeat', async () => {
    const { runState, stopHeartbeat } = createRunState();
    const execute = vi.fn(async () => ({ result: { result: 'Hello FlowMind' } }));

    await createService(runState, execute).executeRun('run-1');

    expect(runState.prepareForExecution).toHaveBeenCalledWith(run);
    expect(runState.startHeartbeat).toHaveBeenCalledWith('run-1');
    expect(execute).toHaveBeenCalledWith(canvas, { name: 'FlowMind' }, {
      observer: expect.any(PrismaExecutionObserver) as ExecutionObserver,
    });
    expect(runState.markSuccess).toHaveBeenCalledWith('run-1', { result: 'Hello FlowMind' });
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('marks the run failed, stops the heartbeat and rethrows so BullMQ records the failure', async () => {
    const { runState, stopHeartbeat } = createRunState();
    const failure = new Error('Variable "missing" not found');
    const execute = vi.fn(async () => {
      throw failure;
    });

    await expect(createService(runState, execute).executeRun('run-1')).rejects.toBe(failure);

    expect(runState.markFailed).toHaveBeenCalledWith('run-1', failure);
    expect(runState.markSuccess).not.toHaveBeenCalled();
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('does not execute when the run state says skip', async () => {
    const { runState } = createRunState('skip');
    const execute = vi.fn();

    await createService(runState, execute).executeRun('run-1');

    expect(execute).not.toHaveBeenCalled();
    expect(runState.startHeartbeat).not.toHaveBeenCalled();
  });
});

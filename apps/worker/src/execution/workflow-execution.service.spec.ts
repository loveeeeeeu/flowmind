import type { ExecutionObserver, WorkflowEngine } from '@flowmind/workflow-core';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ExecutionLogService } from './execution-log.service.js';
import type { RunEventPublisher } from '../execution-events/run-event-publisher.service.js';
import { PrismaExecutionObserver } from './prisma-execution-observer.js';
import type { RunExecutionDecision, RunStateService } from './run-state.service.js';
import { WorkflowExecutionService } from './workflow-execution.service.js';

const canvas = { nodes: [], edges: [] };

interface FakeRun {
  id: string;
  status: string;
  heartbeatAt: null;
  input: Record<string, unknown>;
  source: string;
  workflow: { projectId: string };
  workflowVersion: { id: string; version: number; canvas: unknown } | null;
  draftSnapshot: unknown;
}

const run: FakeRun = {
  id: 'run-1',
  status: 'PENDING',
  heartbeatAt: null,
  input: { name: 'FlowMind' },
  source: 'PUBLISHED',
  workflow: { projectId: 'project-1' },
  workflowVersion: { id: 'version-1', version: 1, canvas },
  draftSnapshot: null,
};

function createRunState(decision: RunExecutionDecision = 'execute', loadedRun = run) {
  const stopHeartbeat = vi.fn();

  return {
    stopHeartbeat,
    runState: {
      findRun: vi.fn(async () => loadedRun),
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
    { publish: vi.fn(async () => 1) } as unknown as RunEventPublisher,
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
      projectId: 'project-1',
      workflowId: undefined,
      workflowRunId: 'run-1',
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

  it('executes the version snapshot bound to the run, not whatever is latest now', async () => {
    // The run was bound to v2 when created; v3 and a newer draft exist by the time it executes.
    const v2Canvas = {
      nodes: [{ id: 'end', type: 'end', data: { outputVariable: 'v2' } }],
      edges: [],
    };
    const { runState } = createRunState('execute', {
      ...run,
      workflowVersion: { id: 'version-2', version: 2, canvas: v2Canvas },
    });
    const execute = vi.fn(async () => ({ result: {} }));

    await createService(runState, execute).executeRun('run-1');

    expect(execute).toHaveBeenCalledWith(v2Canvas, expect.anything(), expect.anything());
  });

  it('executes the draft snapshot of a DRAFT run, even if the editor changed since', async () => {
    // Snapshot A was taken when "Test Draft" was clicked; the editor moved on to B afterwards.
    const snapshotA = {
      nodes: [{ id: 'end', type: 'end', data: { outputVariable: 'a' } }],
      edges: [],
    };
    const { runState } = createRunState('execute', {
      ...run,
      source: 'DRAFT',
      workflowVersion: null,
      draftSnapshot: snapshotA,
    });
    const execute = vi.fn(async () => ({ result: {} }));

    await createService(runState, execute).executeRun('run-1');

    expect(execute).toHaveBeenCalledWith(snapshotA, expect.anything(), expect.anything());
  });

  it('fails a DRAFT run without a snapshot', async () => {
    const { runState } = createRunState('execute', {
      ...run,
      source: 'DRAFT',
      workflowVersion: null,
      draftSnapshot: null,
    });
    const execute = vi.fn();

    await expect(createService(runState, execute).executeRun('run-1')).rejects.toThrow(
      'Draft run has no snapshot',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(runState.markFailed).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ code: 'DRAFT_SNAPSHOT_MISSING' }),
    );
  });

  it('fails a legacy run without a version instead of falling back to the draft', async () => {
    const { runState, stopHeartbeat } = createRunState('execute', {
      ...run,
      workflowVersion: null,
    });
    const execute = vi.fn();

    await expect(createService(runState, execute).executeRun('run-1')).rejects.toThrow(
      'Published run has no workflow version',
    );

    expect(execute).not.toHaveBeenCalled();
    expect(runState.startHeartbeat).not.toHaveBeenCalled();
    expect(stopHeartbeat).not.toHaveBeenCalled();
    expect(runState.markFailed).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ code: 'WORKFLOW_VERSION_MISSING' }),
    );
  });

  it('does not execute when the run state says skip', async () => {
    const { runState } = createRunState('skip');
    const execute = vi.fn();

    await createService(runState, execute).executeRun('run-1');

    expect(execute).not.toHaveBeenCalled();
    expect(runState.startHeartbeat).not.toHaveBeenCalled();
  });
});

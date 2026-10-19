import type {
  ExecutionLogLevel,
  NodeRun,
  NodeRunStatus,
  RunStatus,
  WorkflowRunSummary,
} from '../../types/run';

const TERMINAL_RUN_STATUSES: RunStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

const RUN_STATUS_ORDER: Record<RunStatus, number> = {
  PENDING: 0,
  RUNNING: 1,
  SUCCESS: 2,
  FAILED: 2,
  CANCELLED: 2,
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  PENDING: '排队中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
};

export const NODE_RUN_STATUS_LABELS: Record<NodeRunStatus, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  SKIPPED: '已跳过',
};

export const LOG_LEVEL_LABELS: Record<ExecutionLogLevel, string> = {
  DEBUG: '调试',
  INFO: '信息',
  WARN: '警告',
  ERROR: '错误',
};

export function isTerminalRunStatus(status: RunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_RUN_STATUSES.includes(status);
}

/** Incremental SSE events must never move a Run backward after a terminal status. */
export function shouldApplyRunStatus(current: RunStatus, next: RunStatus): boolean {
  return !isTerminalRunStatus(current) && RUN_STATUS_ORDER[next] >= RUN_STATUS_ORDER[current];
}

export function isUnfinishedRun(run: WorkflowRunSummary): boolean {
  return !isTerminalRunStatus(run.status);
}

export function getDurationMs(
  startedAt: string | null,
  finishedAt: string | null,
): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  return new Date(finishedAt).getTime() - new Date(startedAt).getTime();
}

/**
 * Like getDurationMs, but an unfinished span counts up to `now` when one is given.
 * `now` comes from the polling query's dataUpdatedAt, so render stays pure.
 */
export function getElapsedMs(
  startedAt: string | null,
  finishedAt: string | null,
  now: number | null,
): number | null {
  if (startedAt && !finishedAt && now !== null) {
    return Math.max(0, now - new Date(startedAt).getTime());
  }

  return getDurationMs(startedAt, finishedAt);
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return '—';
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatRunTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatLogTime(value: string): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString('zh-CN', { hour12: false });

  return `${time}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/** One executed step (sequence); retries of the step are its attempts, oldest first. */
export interface NodeRunGroup {
  sequence: number;
  nodeId: string;
  nodeType: string;
  iteration: number | null;
  attempts: NodeRun[];
  latest: NodeRun;
}

/** Expects node runs ordered by sequence, then attempt (as the API returns them). */
export function groupNodeRuns(nodeRuns: NodeRun[]): NodeRunGroup[] {
  const groups: NodeRunGroup[] = [];

  for (const nodeRun of nodeRuns) {
    const last = groups.at(-1);

    if (last && last.sequence === nodeRun.sequence) {
      last.attempts.push(nodeRun);
      last.latest = nodeRun;
      continue;
    }

    groups.push({
      sequence: nodeRun.sequence,
      nodeId: nodeRun.nodeId,
      nodeType: nodeRun.nodeType,
      iteration: nodeRun.iteration,
      attempts: [nodeRun],
      latest: nodeRun,
    });
  }

  return groups;
}

export type CanvasRunStatus = 'idle' | 'running' | 'success' | 'failed';

const CANVAS_STATUS_BY_NODE_RUN: Record<NodeRunStatus, CanvasRunStatus> = {
  PENDING: 'running',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'idle',
};

/**
 * The latest node run of each node decides its canvas status: a retried node that finally
 * succeeded is green, a loop body shows its last iteration. Nodes absent from the map are idle.
 */
export function buildNodeStatusMap(nodeRuns: NodeRun[]): Map<string, CanvasRunStatus> {
  const statusByNode = new Map<string, CanvasRunStatus>();

  for (const nodeRun of nodeRuns) {
    statusByNode.set(nodeRun.nodeId, CANVAS_STATUS_BY_NODE_RUN[nodeRun.status]);
  }

  return statusByNode;
}

export type CanvasExecutionStatus = NodeRunStatus | 'NOT_EXECUTED';

export interface NodeExecutionView {
  nodeId: string;
  status: CanvasExecutionStatus;
  /** The specific execution instance currently represented by this canvas node. */
  latestNodeRunId: string | null;
  sequence: number | null;
  attempt: number | null;
  /** Distinct logical invocations. Loop iterations increase this number; retries do not. */
  executionCount: number;
  /** The highest retry attempt seen across the node's execution history. */
  maxAttempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}

const NODE_STATUS_ORDER: Record<NodeRunStatus, number> = {
  PENDING: 0,
  RUNNING: 1,
  SUCCESS: 2,
  FAILED: 2,
  SKIPPED: 2,
};

export function shouldApplyNodeRunStatus(current: NodeRunStatus, next: NodeRunStatus): boolean {
  const currentTerminal = NODE_STATUS_ORDER[current] === 2;

  return !currentTerminal ? NODE_STATUS_ORDER[next] >= NODE_STATUS_ORDER[current] : current === next;
}

/**
 * NodeRun is an execution instance; a canvas node is only a workflow definition node.
 * Group by node id for the canvas, but choose the current view by sequence + attempt.
 */
export function buildNodeExecutionViews(nodeRuns: NodeRun[]): Map<string, NodeExecutionView> {
  const byNodeId = new Map<string, NodeRun[]>();

  for (const nodeRun of nodeRuns) {
    const executions = byNodeId.get(nodeRun.nodeId) ?? [];
    executions.push(nodeRun);
    byNodeId.set(nodeRun.nodeId, executions);
  }

  const views = new Map<string, NodeExecutionView>();

  for (const [nodeId, executions] of byNodeId) {
    const sorted = [...executions].sort(
      (left, right) => left.sequence - right.sequence || left.attempt - right.attempt,
    );
    const latest = sorted.at(-1)!;
    const error = latest.errorCode
      ? { code: latest.errorCode, message: latest.errorMessage ?? '' }
      : null;

    views.set(nodeId, {
      nodeId,
      status: latest.status,
      latestNodeRunId: latest.id,
      sequence: latest.sequence,
      attempt: latest.attempt,
      executionCount: new Set(sorted.map((item) => item.sequence)).size,
      maxAttempt: Math.max(...sorted.map((item) => item.attempt)),
      startedAt: latest.startedAt,
      finishedAt: latest.finishedAt,
      error,
    });
  }

  return views;
}

/** Missing NodeRun means it has not run; terminal workflows make that explicit instead of "pending". */
export function getUnexecutedNodeView(nodeId: string, runStatus: RunStatus): NodeExecutionView {
  return {
    nodeId,
    status: isTerminalRunStatus(runStatus) ? 'NOT_EXECUTED' : 'PENDING',
    latestNodeRunId: null,
    sequence: null,
    attempt: null,
    executionCount: 0,
    maxAttempt: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}

export interface RunMetrics {
  steps: number;
  attempts: number;
  failedAttempts: number;
  retries: number;
}

export function getRunMetrics(nodeRuns: NodeRun[]): RunMetrics {
  const steps = new Set(nodeRuns.map((nodeRun) => nodeRun.sequence)).size;

  return {
    steps,
    attempts: nodeRuns.length,
    failedAttempts: nodeRuns.filter((nodeRun) => nodeRun.status === 'FAILED').length,
    retries: nodeRuns.length - steps,
  };
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parseRunInput(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text.trim() || '{}');

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('运行输入必须是 JSON 对象');
  }

  return value as Record<string, unknown>;
}

import type { NodeRunStatus, RunStatus, WorkflowRunSummary } from '../../types/run';

const TERMINAL_RUN_STATUSES: RunStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

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

export function isTerminalRunStatus(status: RunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_RUN_STATUSES.includes(status);
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

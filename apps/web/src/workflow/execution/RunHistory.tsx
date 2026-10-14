import type { WorkflowRunSummary } from '../../types/run';
import { RunStatusBadge } from './RunStatusBadge';
import { RunTriggerTag } from './RunTriggerTag';
import { RunVersionTag } from './RunVersionTag';
import { formatDuration, formatRunTime, getDurationMs } from './runUtils';

interface RunHistoryProps {
  runs: WorkflowRunSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export function RunHistory({ runs, isLoading, error, selectedRunId, onSelectRun }: RunHistoryProps) {
  if (isLoading) {
    return <p className="execution-empty">正在加载运行历史…</p>;
  }

  if (error) {
    return <p className="error-message">加载运行历史失败：{error.message}</p>;
  }

  if (!runs || runs.length === 0) {
    return <p className="execution-empty">还没有运行记录</p>;
  }

  return (
    <ul className="run-history-list">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            className={`run-history-item ${run.id === selectedRunId ? 'active' : ''}`}
            onClick={() => onSelectRun(run.id)}
          >
            <span className="run-history-row">
              <RunStatusBadge status={run.status} />
              <RunVersionTag run={run} />
              <RunTriggerTag run={run} />
              <span className="run-history-time">{formatRunTime(run.createdAt)}</span>
            </span>
            <span className="run-history-row">
              <code className="run-history-id">{run.id.slice(-8)}</code>
              <span className="run-history-meta">
                {run.errorCode ?? formatDuration(getDurationMs(run.startedAt, run.finishedAt))}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

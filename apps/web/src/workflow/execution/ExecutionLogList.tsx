import { useQuery } from '@tanstack/react-query';
import { getWorkflowRunLogs } from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import type { NodeRun } from '../../types/run';
import { LOG_LEVEL_LABELS, formatJson, formatLogTime } from './runUtils';

const LOG_LIMIT = 500;

interface ExecutionLogListProps {
  projectId: string;
  runId: string;
  nodeRuns: NodeRun[];
  nodeLabels: Record<string, string>;
}

/** Mounted only while the Logs tab is open, so logs are never fetched in the background. */
export function ExecutionLogList({ projectId, runId, nodeRuns, nodeLabels }: ExecutionLogListProps) {
  const logsQuery = useQuery({
    queryKey: queryKeys.runs.logs(projectId, runId),
    queryFn: () => getWorkflowRunLogs(projectId, runId),
  });
  const logs = logsQuery.data;

  if (!logs) {
    if (logsQuery.isError) {
      return <p className="error-message">加载日志失败：{logsQuery.error.message}</p>;
    }

    return <p className="execution-empty">正在加载日志…</p>;
  }

  if (logs.length === 0) {
    return <p className="execution-empty">暂无日志</p>;
  }

  const nodeIdByRunId = new Map(nodeRuns.map((nodeRun) => [nodeRun.id, nodeRun.nodeId]));

  return (
    <>
      {logsQuery.isError && (
        <p className="execution-warning">刷新日志失败：{logsQuery.error.message}，将自动重试</p>
      )}
      <ol className="log-list">
        {logs.map((log) => {
          const nodeId = log.nodeRunId ? nodeIdByRunId.get(log.nodeRunId) : undefined;

          return (
            <li key={log.id} className={`log-item ${log.level.toLowerCase()}`}>
              <div className="log-row">
                <span className="log-time">{formatLogTime(log.createdAt)}</span>
                <span className={`log-level ${log.level.toLowerCase()}`}>
                  {LOG_LEVEL_LABELS[log.level]}
                </span>
                {nodeId && <span className="log-node">{nodeLabels[nodeId] ?? '已删除的节点'}</span>}
                <span className="log-message">{log.message}</span>
              </div>
              {log.metadata && (
                <details className="run-json-details log-metadata">
                  <summary>详情</summary>
                  <pre className="run-json">{formatJson(log.metadata)}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      {logs.length >= LOG_LIMIT && (
        <p className="panel-hint">仅显示前 {LOG_LIMIT} 条日志</p>
      )}
    </>
  );
}

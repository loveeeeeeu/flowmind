import type { WorkflowRunDetail } from '../../types/run';
import { NodeRunList } from './NodeRunList';
import { RunStatusBadge } from './RunStatusBadge';
import { formatDuration, formatJson, formatRunTime, getDurationMs } from './runUtils';

interface RunDetailProps {
  run: WorkflowRunDetail | undefined;
  isLoading: boolean;
  refreshError: Error | null;
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function RunDetail({
  run,
  isLoading,
  refreshError,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
}: RunDetailProps) {
  if (!run) {
    if (isLoading) {
      return <p className="execution-empty">正在加载运行详情…</p>;
    }

    if (refreshError) {
      return <p className="error-message">加载运行详情失败：{refreshError.message}</p>;
    }

    return <p className="execution-empty">暂无运行记录</p>;
  }

  const failedNodeRun = run.nodeRuns.find((nodeRun) => nodeRun.status === 'FAILED');

  return (
    <div className="run-detail">
      <div className="run-detail-head">
        <RunStatusBadge status={run.status} />
        <code className="run-detail-id">{run.id}</code>
        <span className="run-detail-meta">创建于 {formatRunTime(run.createdAt)}</span>
        <span className="run-detail-meta">
          耗时 {formatDuration(getDurationMs(run.startedAt, run.finishedAt))}
        </span>
      </div>

      {refreshError && (
        <p className="execution-warning">刷新运行状态失败：{refreshError.message}，将自动重试</p>
      )}

      {run.status === 'PENDING' && (
        <p className="panel-hint">运行已进入队列，等待 Worker 处理…</p>
      )}

      {run.status === 'FAILED' && (
        <div className="run-error-box">
          <strong>{run.errorCode ?? 'EXECUTION_ERROR'}</strong>
          <p>{run.errorMessage ?? '运行失败'}</p>
          {failedNodeRun && (
            <div className="run-error-node">
              <span>
                失败节点：{nodeLabels[failedNodeRun.nodeId] ?? failedNodeRun.nodeId}
              </span>
              <button
                type="button"
                className="subtle-button"
                onClick={() => onSelectNode(failedNodeRun.nodeId)}
              >
                查看节点
              </button>
            </div>
          )}
        </div>
      )}

      {run.status === 'SUCCESS' && (
        <section className="run-section">
          <h4>输出</h4>
          <pre className="run-json">{formatJson(run.output)}</pre>
        </section>
      )}

      <details className="run-json-details">
        <summary>运行输入</summary>
        <pre className="run-json">{formatJson(run.input ?? {})}</pre>
      </details>

      <section className="run-section">
        <h4>节点执行（{run.nodeRuns.length}）</h4>
        <NodeRunList
          nodeRuns={run.nodeRuns}
          nodeLabels={nodeLabels}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      </section>
    </div>
  );
}

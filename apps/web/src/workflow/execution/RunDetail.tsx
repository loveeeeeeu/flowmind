import { useState } from 'react';
import type { WorkflowRunDetail } from '../../types/run';
import { ExecutionLogList } from './ExecutionLogList';
import { NodeRunTrace } from './NodeRunTrace';
import { RunStatusBadge } from './RunStatusBadge';
import { RunTriggerTag } from './RunTriggerTag';
import { RunVersionTag } from './RunVersionTag';
import {
  formatDuration,
  formatJson,
  formatRunTime,
  getElapsedMs,
  getRunMetrics,
  isTerminalRunStatus,
} from './runUtils';

type RunDetailView = 'trace' | 'logs';

interface RunDetailProps {
  projectId: string;
  run: WorkflowRunDetail | undefined;
  isLoading: boolean;
  refreshError: Error | null;
  /** When the run detail was last fetched; drives the elapsed time of unfinished runs. */
  fetchedAt: number;
  workflowUpdatedAt: string;
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onViewVersion: (versionId: string) => void;
}

export function RunDetail({
  projectId,
  run,
  isLoading,
  refreshError,
  fetchedAt,
  workflowUpdatedAt,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
  onViewVersion,
}: RunDetailProps) {
  const [view, setView] = useState<RunDetailView>('trace');

  if (!run) {
    if (isLoading) {
      return <p className="execution-empty">正在加载运行详情…</p>;
    }

    if (refreshError) {
      return <p className="error-message">加载运行详情失败：{refreshError.message}</p>;
    }

    return <p className="execution-empty">暂无运行记录</p>;
  }

  const now = isTerminalRunStatus(run.status) ? null : fetchedAt;
  const metrics = getRunMetrics(run.nodeRuns);
  // Earlier attempts of a retried step can be FAILED too; the run failed on the last one.
  const failedNodeRun = [...run.nodeRuns].reverse().find((nodeRun) => nodeRun.status === 'FAILED');
  const failedNodeLabel = failedNodeRun ? nodeLabels[failedNodeRun.nodeId] : undefined;
  const ranOlderDraft = new Date(workflowUpdatedAt).getTime() > new Date(run.createdAt).getTime();
  const publishedVersion = run.source === 'PUBLISHED' ? run.workflowVersion : null;

  return (
    <div className="run-detail">
      <div className="run-detail-head">
        <RunStatusBadge status={run.status} />
        <RunVersionTag run={run} />
        <RunTriggerTag run={run} />
        <code className="run-detail-id">{run.id}</code>
        <span className="run-detail-meta">创建于 {formatRunTime(run.createdAt)}</span>
        <span className="run-detail-meta">
          耗时 {formatDuration(getElapsedMs(run.startedAt, run.finishedAt, now))}
        </span>
        {publishedVersion && (
          <button
            type="button"
            className="subtle-button run-view-version"
            onClick={() => onViewVersion(publishedVersion.id)}
          >
            查看 v{publishedVersion.version}
          </button>
        )}
      </div>

      <dl className="run-metrics">
        <div className="run-metric">
          <dt>执行步骤</dt>
          <dd>{metrics.steps}</dd>
        </div>
        <div className="run-metric">
          <dt>节点尝试</dt>
          <dd>{metrics.attempts}</dd>
        </div>
        <div className="run-metric">
          <dt>重试次数</dt>
          <dd>{metrics.retries}</dd>
        </div>
        <div className={`run-metric ${metrics.failedAttempts > 0 ? 'failed' : ''}`}>
          <dt>失败尝试</dt>
          <dd>{metrics.failedAttempts}</dd>
        </div>
      </dl>

      {ranOlderDraft && (
        <p className="run-stale-hint">
          {run.source === 'DRAFT'
            ? '这次测试执行的是点击测试时的画布快照，之后草稿有变化，追踪中的节点可能与当前画布不一致'
            : run.workflowVersion
              ? `这次运行执行的是 v${run.workflowVersion.version} 快照，之后草稿或发布有变化，追踪中的节点可能与当前画布不一致`
              : '工作流在这次运行之后被修改过，追踪中的节点可能与当前画布不一致'}
        </p>
      )}

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
              <span>失败节点：{failedNodeLabel ?? '已删除的节点'}</span>
              {failedNodeLabel !== undefined && (
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => onSelectNode(failedNodeRun.nodeId)}
                >
                  定位失败节点
                </button>
              )}
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

      <div className="run-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'trace'}
          className={`run-view-tab ${view === 'trace' ? 'active' : ''}`}
          onClick={() => setView('trace')}
        >
          追踪（{metrics.steps}）
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'logs'}
          className={`run-view-tab ${view === 'logs' ? 'active' : ''}`}
          onClick={() => setView('logs')}
        >
          日志
        </button>
      </div>

      {view === 'trace' ? (
        <NodeRunTrace
          nodeRuns={run.nodeRuns}
          nodeLabels={nodeLabels}
          selectedNodeId={selectedNodeId}
          now={now}
          onSelectNode={onSelectNode}
        />
      ) : (
        <ExecutionLogList
          projectId={projectId}
          runId={run.id}
          runStatus={run.status}
          nodeRuns={run.nodeRuns}
          nodeLabels={nodeLabels}
        />
      )}
    </div>
  );
}

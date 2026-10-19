import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNodeRunDebug } from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import type { WorkflowRunDetail } from '../../types/run';
import type { WorkflowNode } from '../types/workflowCanvas';
import {
  formatDuration,
  formatJson,
  formatLogTime,
  formatRunTime,
  getElapsedMs,
  groupNodeExecutions,
  LOG_LEVEL_LABELS,
} from './runUtils';
import { RunStatusBadge } from './RunStatusBadge';

interface NodeDebugPanelProps {
  projectId: string;
  run: WorkflowRunDetail;
  node: WorkflowNode | null;
  selectedNodeRunId: string | null;
  onSelectNodeRun: (nodeRunId: string | null) => void;
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
}

function JsonBlock({ value }: { value: unknown | null }) {
  return <pre className="run-json">{value === null ? 'No data' : formatJson(value)}</pre>;
}

/** Full debug data is fetched on demand; SSE only appends safe logs to an already-open detail. */
export function NodeDebugPanel({
  projectId,
  run,
  node,
  selectedNodeRunId,
  onSelectNodeRun,
}: NodeDebugPanelProps) {
  const groups = node ? groupNodeExecutions(run.nodeRuns, node.id) : [];
  // A new Run intentionally clears selectedNodeRunId, while the editor can keep the same canvas
  // node selected. In that case (or after switching away from an older Run), inspect this Run's
  // newest concrete NodeRun automatically instead of leaving a blank Debug Panel.
  const selectedNodeRunStillExists = groups.some((group) =>
    group.attempts.some((attempt) => attempt.id === selectedNodeRunId),
  );
  const activeNodeRunId = selectedNodeRunStillExists
    ? selectedNodeRunId
    : groups.at(-1)?.attempts.at(-1)?.id ?? null;
  const selectedGroupIndex = groups.findIndex((group) =>
    group.attempts.some((attempt) => attempt.id === activeNodeRunId),
  );
  const selectedGroup = selectedGroupIndex >= 0 ? groups[selectedGroupIndex] : undefined;
  const selectedAttempt = selectedGroup?.attempts.find((attempt) => attempt.id === activeNodeRunId);
  const debugQuery = useQuery({
    queryKey: activeNodeRunId
      ? queryKeys.nodeRuns.detail(projectId, run.id, activeNodeRunId)
      : ['node-runs', 'disabled'],
    queryFn: () => getNodeRunDebug(projectId, run.id, activeNodeRunId!),
    enabled: Boolean(activeNodeRunId),
  });
  const now = useNow(selectedAttempt?.status === 'RUNNING');
  const debug = debugQuery.data;

  if (!node) {
    return (
      <aside className="properties-panel node-debug-panel">
        <h3>执行调试</h3>
        <p className="panel-text">选择画布中的节点以查看本次运行的执行详情。</p>
      </aside>
    );
  }

  if (groups.length === 0) {
    return (
      <aside className="properties-panel node-debug-panel">
        <h3>{node.data.label || node.type}</h3>
        <p className="panel-text">此节点在当前 Run 中未执行。</p>
      </aside>
    );
  }

  return (
    <aside className="properties-panel node-debug-panel">
      <h3>执行调试</h3>
      <div className="node-debug-title">
        <strong>{node.data.label || node.type}</strong>
        {selectedAttempt && <RunStatusBadge status={selectedAttempt.status} kind="node" />}
      </div>

      <label className="panel-field">
        <span className="panel-field-label">执行次数</span>
        <select
          value={selectedGroup?.sequence ?? ''}
          onChange={(event) => {
            const group = groups.find((item) => item.sequence === Number(event.target.value));
            onSelectNodeRun(group?.attempts.at(-1)?.id ?? null);
          }}
        >
          {groups.map((group, index) => (
            <option key={group.sequence} value={group.sequence}>
              Execution {index + 1} · Sequence {group.sequence}
            </option>
          ))}
        </select>
      </label>

      {selectedGroup && selectedGroup.attempts.length > 1 && (
        <label className="panel-field">
          <span className="panel-field-label">尝试次数</span>
          <select
            value={activeNodeRunId ?? ''}
            onChange={(event) => onSelectNodeRun(event.target.value || null)}
          >
            {selectedGroup.attempts.map((attempt) => (
              <option key={attempt.id} value={attempt.id}>
                Attempt {attempt.attempt} · {attempt.status}
              </option>
            ))}
          </select>
        </label>
      )}

      {debugQuery.isLoading && <p className="execution-empty">正在加载节点调试数据…</p>}
      {debugQuery.isError && <p className="error-message">加载节点调试失败：{debugQuery.error.message}</p>}

      {debug && (
        <>
          <section className="node-debug-section">
            <h4>概要</h4>
            <dl className="node-debug-summary">
              <div><dt>Sequence</dt><dd>{debug.sequence}</dd></div>
              <div><dt>Attempt</dt><dd>{debug.attempt}</dd></div>
              <div><dt>开始</dt><dd>{formatRunTime(debug.startedAt)}</dd></div>
              <div><dt>结束</dt><dd>{formatRunTime(debug.finishedAt)}</dd></div>
              <div><dt>耗时</dt><dd>{formatDuration(getElapsedMs(debug.startedAt, debug.finishedAt, selectedAttempt?.status === 'RUNNING' ? now : null))}</dd></div>
            </dl>
          </section>

          {debug.error && (
            <section className="node-debug-section node-debug-error">
              <h4>Error</h4>
              <code>{debug.error.code}</code>
              <p>{debug.error.message}</p>
            </section>
          )}

          <section className="node-debug-section"><h4>Input</h4><JsonBlock value={debug.input} /></section>
          <section className="node-debug-section"><h4>Output</h4><JsonBlock value={debug.output} /></section>

          <section className="node-debug-section">
            <h4>Logs</h4>
            {debug.logs.length === 0 ? (
              <p className="panel-text">暂无节点日志。</p>
            ) : (
              <ol className="node-debug-logs">
                {debug.logs.map((log) => (
                  <li key={log.id} className={`log-item ${log.level.toLowerCase()}`}>
                    <div className="log-row">
                      <span className="log-time">{formatLogTime(log.createdAt)}</span>
                      <span className={`log-level ${log.level.toLowerCase()}`}>{LOG_LEVEL_LABELS[log.level]}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                    {log.metadata && (
                      <details className="run-json-details log-metadata">
                        <summary>详情</summary>
                        <JsonBlock value={log.metadata} />
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </aside>
  );
}

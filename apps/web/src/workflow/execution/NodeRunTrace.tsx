import type { NodeRun } from '../../types/run';
import { RunStatusBadge } from './RunStatusBadge';
import { formatDuration, formatJson, getElapsedMs, groupNodeRuns } from './runUtils';

interface NodeRunTraceProps {
  nodeRuns: NodeRun[];
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  /** Current time for still-running spans; null once the run is terminal. */
  now: number | null;
  onSelectNode: (nodeId: string) => void;
}

function NodeRunError({ nodeRun }: { nodeRun: NodeRun }) {
  if (!nodeRun.errorMessage) {
    return null;
  }

  return (
    <p className="node-run-error">
      {nodeRun.errorCode && <code>{nodeRun.errorCode}</code>}
      {nodeRun.errorMessage}
    </p>
  );
}

export function NodeRunTrace({
  nodeRuns,
  nodeLabels,
  selectedNodeId,
  now,
  onSelectNode,
}: NodeRunTraceProps) {
  if (nodeRuns.length === 0) {
    return <p className="execution-empty">暂无节点执行记录</p>;
  }

  return (
    <ol className="node-run-list">
      {groupNodeRuns(nodeRuns).map((group) => {
        const label = nodeLabels[group.nodeId];
        // The run may predate a canvas edit that removed this node.
        const isDeleted = label === undefined;
        const isRetried = group.attempts.length > 1;
        const first = group.attempts[0];
        const { latest } = group;

        return (
          <li
            key={`${group.sequence}-${group.nodeId}`}
            className={`node-run-item ${group.nodeId === selectedNodeId ? 'active' : ''} ${isDeleted ? 'deleted' : ''}`}
          >
            <button
              type="button"
              className="node-run-head"
              onClick={() => onSelectNode(group.nodeId)}
              disabled={isDeleted}
              title={isDeleted ? '该节点已从画布删除' : '在画布中定位该节点'}
            >
              <span className="node-run-sequence">#{group.sequence}</span>
              <span className="node-run-name">{label ?? '已删除的节点'}</span>
              <span className="node-run-type">{group.nodeType}</span>
              {group.iteration !== null && (
                <span className="node-run-type">迭代 {group.iteration}</span>
              )}
              {isRetried && (
                <span className="node-run-attempt">{group.attempts.length} 次尝试</span>
              )}
              <span className="node-run-duration">
                {formatDuration(getElapsedMs(first.startedAt, latest.finishedAt, now))}
              </span>
              <RunStatusBadge status={latest.status} kind="node" />
            </button>

            {isDeleted && (
              <p className="node-run-deleted-hint">
                节点 <code>{group.nodeId}</code> 已不在当前画布中，无法定位
              </p>
            )}

            {isRetried ? (
              <ol className="node-run-attempts">
                {group.attempts.map((attempt) => (
                  <li key={attempt.id} className="node-run-attempt-item">
                    <div className="node-run-attempt-row">
                      <span className="node-run-attempt-label">第 {attempt.attempt} 次</span>
                      <span className="node-run-duration">
                        {formatDuration(getElapsedMs(attempt.startedAt, attempt.finishedAt, now))}
                      </span>
                      <RunStatusBadge status={attempt.status} kind="node" />
                    </div>
                    <NodeRunError nodeRun={attempt} />
                  </li>
                ))}
              </ol>
            ) : (
              <NodeRunError nodeRun={latest} />
            )}

            {latest.input != null && (
              <details className="run-json-details">
                <summary>输入</summary>
                <pre className="run-json">{formatJson(latest.input)}</pre>
              </details>
            )}

            {latest.output != null && (
              <details className="run-json-details">
                <summary>输出</summary>
                <pre className="run-json">{formatJson(latest.output)}</pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

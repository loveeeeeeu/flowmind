import type { NodeRun } from '../../types/run';
import { RunStatusBadge } from './RunStatusBadge';
import { formatDuration, formatJson, getDurationMs } from './runUtils';

interface NodeRunListProps {
  nodeRuns: NodeRun[];
  nodeLabels: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function NodeRunList({
  nodeRuns,
  nodeLabels,
  selectedNodeId,
  onSelectNode,
}: NodeRunListProps) {
  if (nodeRuns.length === 0) {
    return <p className="execution-empty">暂无节点执行记录</p>;
  }

  const retriedSequences = new Set(
    nodeRuns.filter((nodeRun) => nodeRun.attempt > 1).map((nodeRun) => nodeRun.sequence),
  );

  return (
    <ol className="node-run-list">
      {nodeRuns.map((nodeRun) => (
        <li
          key={nodeRun.id}
          className={`node-run-item ${nodeRun.nodeId === selectedNodeId ? 'active' : ''}`}
        >
          <button
            type="button"
            className="node-run-head"
            onClick={() => onSelectNode(nodeRun.nodeId)}
            title="在画布中选中该节点"
          >
            <span className="node-run-sequence">#{nodeRun.sequence}</span>
            <span className="node-run-name">{nodeLabels[nodeRun.nodeId] ?? nodeRun.nodeId}</span>
            <span className="node-run-type">{nodeRun.nodeType}</span>
            {nodeRun.iteration !== null && (
              <span className="node-run-type">迭代 {nodeRun.iteration}</span>
            )}
            {retriedSequences.has(nodeRun.sequence) && (
              <span className="node-run-attempt">第 {nodeRun.attempt} 次尝试</span>
            )}
            <span className="node-run-duration">
              {formatDuration(getDurationMs(nodeRun.startedAt, nodeRun.finishedAt))}
            </span>
            <RunStatusBadge status={nodeRun.status} kind="node" />
          </button>

          {nodeRun.errorMessage && (
            <p className="node-run-error">
              {nodeRun.errorCode && <code>{nodeRun.errorCode}</code>}
              {nodeRun.errorMessage}
            </p>
          )}

          {nodeRun.input != null && (
            <details className="run-json-details">
              <summary>输入</summary>
              <pre className="run-json">{formatJson(nodeRun.input)}</pre>
            </details>
          )}

          {nodeRun.output != null && (
            <details className="run-json-details">
              <summary>输出</summary>
              <pre className="run-json">{formatJson(nodeRun.output)}</pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

import type { NodeExecutionView } from './runUtils';

interface ExecutionBadgeProps {
  execution: NodeExecutionView | null | undefined;
}

const STATUS_META = {
  PENDING: { icon: '○', label: 'Pending', className: 'pending' },
  RUNNING: { icon: '◌', label: 'Running', className: 'running' },
  SUCCESS: { icon: '✓', label: 'Success', className: 'success' },
  FAILED: { icon: '!', label: 'Failed', className: 'failed' },
  SKIPPED: { icon: '↷', label: 'Skipped', className: 'skipped' },
  NOT_EXECUTED: { icon: '—', label: 'Not executed', className: 'not-executed' },
} as const;

/** Small runtime projection only. It is intentionally not part of persisted canvas node data. */
export function ExecutionBadge({ execution }: ExecutionBadgeProps) {
  if (!execution) {
    return null;
  }

  const meta = STATUS_META[execution.status];
  const details: string[] = [];

  if (execution.maxAttempt > 1) {
    details.push(`Retry ${execution.maxAttempt}`);
  }
  if (execution.executionCount > 1) {
    details.push(`×${execution.executionCount}`);
  }

  return (
    <span className={`node-execution-badge ${meta.className}`} title={details.join(' · ') || meta.label}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
      {details.length > 0 && <span className="node-execution-details">{details.join(' · ')}</span>}
    </span>
  );
}

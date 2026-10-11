import type { NodeRunStatus, RunStatus } from '../../types/run';
import { NODE_RUN_STATUS_LABELS, RUN_STATUS_LABELS } from './runUtils';

interface RunStatusBadgeProps {
  status: RunStatus | NodeRunStatus;
  kind?: 'run' | 'node';
}

export function RunStatusBadge({ status, kind = 'run' }: RunStatusBadgeProps) {
  const label =
    kind === 'node'
      ? NODE_RUN_STATUS_LABELS[status as NodeRunStatus]
      : RUN_STATUS_LABELS[status as RunStatus];

  return <span className={`run-status ${status.toLowerCase()}`}>{label}</span>;
}

export type RunEventType =
  | 'RUN_SNAPSHOT'
  | 'RUN_STATUS_CHANGED'
  | 'NODE_STATUS_CHANGED'
  | 'LOG_APPENDED';

export type RunEventStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type NodeRunEventStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface RunEventError {
  code: string;
  message: string;
}

export interface BaseRunEvent {
  eventId: string;
  runId: string;
  type: RunEventType;
  timestamp: string;
}

export interface RunSnapshotEvent extends BaseRunEvent {
  type: 'RUN_SNAPSHOT';
  status: RunEventStatus;
  output: unknown | null;
  error: RunEventError | null;
}

export interface RunStatusChangedEvent extends BaseRunEvent {
  type: 'RUN_STATUS_CHANGED';
  status: RunEventStatus;
  error: RunEventError | null;
}

export interface NodeStatusChangedEvent extends BaseRunEvent {
  type: 'NODE_STATUS_CHANGED';
  nodeRunId: string;
  nodeId: string;
  nodeType: string;
  sequence: number;
  attempt: number;
  status: NodeRunEventStatus;
  error: RunEventError | null;
}

export interface LogAppendedEvent extends BaseRunEvent {
  type: 'LOG_APPENDED';
  log: {
    id: string;
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    nodeRunId: string | null;
    message: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
}

export type RunEvent =
  | RunSnapshotEvent
  | RunStatusChangedEvent
  | NodeStatusChangedEvent
  | LogAppendedEvent;

/** A run has its own short-lived notification channel; Pub/Sub is never execution history. */
export function getRunEventChannel(runId: string) {
  return `flowmind:run:${runId}:events`;
}

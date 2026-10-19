import type { NodeExecutionView } from './runUtils';

export type NodeDataWithExecution = {
  execution?: NodeExecutionView | null;
};

/** Workflow node data types remain definition-only; the extra field exists only in rendered nodes. */
export function getNodeExecution(data: object): NodeExecutionView | null {
  return (data as NodeDataWithExecution).execution ?? null;
}

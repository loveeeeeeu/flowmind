import type { WorkflowCanvas, WorkflowEdge, WorkflowNode } from './types/workflowCanvas';

export function toPersistedCanvas(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowCanvas {
  return {
    nodes: nodes.map(
      ({ id, type, position, data }) => ({ id, type, position, data }) as WorkflowNode,
    ),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
    })),
  };
}
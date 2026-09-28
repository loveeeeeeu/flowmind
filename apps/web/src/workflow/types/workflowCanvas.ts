import type { Edge, Node } from '@xyflow/react';

export type StartNodeData = {
  label: string;
};

export type EndNodeData = {
  label: string;
};

export type LlmNodeData = {
  label: string;
};

export type StartNodeType = Node<StartNodeData, 'start'>;
export type EndNodeType = Node<EndNodeData, 'end'>;
export type LlmNodeType = Node<LlmNodeData, 'llm'>;

export type WorkflowNode = StartNodeType | EndNodeType | LlmNodeType;
export type WorkflowEdge = Edge;

export type WorkflowCanvas = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
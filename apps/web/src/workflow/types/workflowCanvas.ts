import type { Edge, Node } from '@xyflow/react';

export type BaseNodeData = {
  label: string;
};

export type StartNodeData = BaseNodeData;

export type EndNodeData = BaseNodeData & {
  outputVariable?: string;
};

export type LlmNodeData = BaseNodeData & {
  model: string;
  prompt: string;
};

export type TemplateNodeData = BaseNodeData & {
  template: string;
  outputVariable: string;
};

export type VariableNodeData = BaseNodeData & {
  variableName: string;
  value: unknown;
};

export type StartNodeType = Node<StartNodeData, 'start'>;
export type EndNodeType = Node<EndNodeData, 'end'>;
export type LlmNodeType = Node<LlmNodeData, 'llm'>;
export type TemplateNodeType = Node<TemplateNodeData, 'template'>;
export type VariableNodeType = Node<VariableNodeData, 'variable'>;

export type WorkflowNode =
  | StartNodeType
  | EndNodeType
  | LlmNodeType
  | TemplateNodeType
  | VariableNodeType;

export type WorkflowNodeData = WorkflowNode['data'];
export type WorkflowEdge = Edge;

export type WorkflowCanvas = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
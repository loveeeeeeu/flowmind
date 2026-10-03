import type { Edge, Node } from '@xyflow/react';

export type BaseNodeData = {
  label: string;
};

export type StartNodeData = BaseNodeData;

export type EndNodeData = BaseNodeData & {
  outputVariable?: string;
};

export type LlmNodeData = BaseNodeData & {
  provider?: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  outputVariable?: string;
};

export type TemplateNodeData = BaseNodeData & {
  template: string;
  outputVariable: string;
};

export type VariableNodeData = BaseNodeData & {
  variableName: string;
  value: unknown;
};

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpNodeData = BaseNodeData & {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  outputVariable: string;
};

export type StartNodeType = Node<StartNodeData, 'start'>;
export type EndNodeType = Node<EndNodeData, 'end'>;
export type LlmNodeType = Node<LlmNodeData, 'llm'>;
export type TemplateNodeType = Node<TemplateNodeData, 'template'>;
export type VariableNodeType = Node<VariableNodeData, 'variable'>;

export type HttpNodeType = Node<HttpNodeData, 'http'>;

export type WorkflowNode =
  | StartNodeType
  | EndNodeType
  | LlmNodeType
  | TemplateNodeType
  | VariableNodeType
  | HttpNodeType;

export type WorkflowNodeData = WorkflowNode['data'];
export type WorkflowEdge = Edge;

export type WorkflowCanvas = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
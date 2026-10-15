import type { Edge, Node } from '@xyflow/react';

export type BaseNodeData = {
  label: string;
};

export type StartNodeData = BaseNodeData;

export type EndNodeData = BaseNodeData & {
  outputVariable?: string;
};

/**
 * The node references a Model Center entry by id only: provider, endpoint, secret and even the
 * provider's model name are resolved at run time. '' means no model selected yet.
 */
export type LlmNodeData = BaseNodeData & {
  modelId: string;
  /** Legacy (before Model Center). Read only to prompt a migration; removed once a model is picked. */
  provider?: string;
  /** Legacy, see provider. */
  model?: string;
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  outputVariable?: string;
};

export type TemplateNodeData = BaseNodeData & {
  template: string;
  outputVariable: string;
};

export type VariableSourceType = 'literal' | 'reference';

export type VariableNodeData = BaseNodeData & {
  variableName: string;
  sourceType?: VariableSourceType;
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

export const CONDITION_OPERATORS = [
  { value: 'eq', label: '==' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]['value'];
export type ConditionValueType = 'string' | 'number' | 'boolean';

export type IfNodeData = BaseNodeData & {
  variable: string;
  operator: ConditionOperator;
  valueType: ConditionValueType;
  value: string;
};

export type LoopNodeData = BaseNodeData & {
  itemsPath: string;
  itemVariable: string;
  indexVariable: string;
};

export type CodeNodeData = BaseNodeData & {
  inputPath: string;
  code: string;
  outputVariable: string;
  timeoutMs?: number;
};

export type StartNodeType = Node<StartNodeData, 'start'>;
export type EndNodeType = Node<EndNodeData, 'end'>;
export type LlmNodeType = Node<LlmNodeData, 'llm'>;
export type TemplateNodeType = Node<TemplateNodeData, 'template'>;
export type VariableNodeType = Node<VariableNodeData, 'variable'>;

export type HttpNodeType = Node<HttpNodeData, 'http'>;
export type IfNodeType = Node<IfNodeData, 'if'>;
export type LoopNodeType = Node<LoopNodeData, 'loop'>;
export type CodeNodeType = Node<CodeNodeData, 'code'>;

export type WorkflowNode =
  | StartNodeType
  | EndNodeType
  | LlmNodeType
  | TemplateNodeType
  | VariableNodeType
  | HttpNodeType
  | IfNodeType
  | LoopNodeType
  | CodeNodeType;

export type WorkflowNodeData = WorkflowNode['data'];
export type WorkflowEdge = Edge;

export type WorkflowCanvas = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
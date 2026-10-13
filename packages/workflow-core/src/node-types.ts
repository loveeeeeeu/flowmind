/**
 * Single source of truth for which node types a workflow may contain. The API validates
 * drafts against it at publish time; the worker's executor registry must cover all of them.
 */
export const SUPPORTED_NODE_TYPES = [
  'start',
  'variable',
  'template',
  'http',
  'if',
  'loop',
  'code',
  'llm',
  'end',
] as const;

export type WorkflowNodeType = (typeof SUPPORTED_NODE_TYPES)[number];

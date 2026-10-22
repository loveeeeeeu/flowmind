/** Public metadata supplied to an LLM. It must never contain credentials or runtime objects. */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

export type ToolSource = 'BUILT_IN' | 'MCP';

export interface ToolDefinition {
  /** Stable machine name used in model tool calls, logs, and traces. */
  name: string;
  displayName: string;
  description: string;
  source: ToolSource;
  inputSchema: ToolInputSchema;
}

/** Trusted runtime identity. It is deliberately not part of ToolDefinition or model arguments. */
export interface ToolExecutionContext {
  projectId: string;
  /** The workflow currently hosting the Agent call, when there is one. */
  workflowId?: string;
  workflowRunId?: string;
  nodeRunId?: string;
  /** Propagated to child workflow calls so a tool cannot recurse forever. */
  workflowCallDepth?: number;
}

export interface ToolExecutionResult {
  /** Tool-specific output, kept bounded by the concrete tool before an Agent sends it to an LLM. */
  output: unknown;
  truncated?: boolean;
}

export interface Tool {
  readonly definition: ToolDefinition;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

/** An untrusted instruction returned by an LLM or external tool protocol. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolCallError {
  code: string;
  message: string;
}

/** Safe observation returned to an Agent. Stack traces and error causes stay inside application logs. */
export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  output?: unknown;
  truncated?: boolean;
  error?: ToolCallError;
}

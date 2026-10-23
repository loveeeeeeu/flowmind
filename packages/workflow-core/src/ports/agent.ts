export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentModelToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCallId?: string;
  toolCalls?: AgentModelToolCall[];
}

export interface AgentModelResponse {
  text: string | null;
  toolCalls: AgentModelToolCall[];
}

/**
 * Product-facing, safe trace of an Agent decision. This deliberately records actions and
 * observations, never provider private reasoning / chain-of-thought.
 */
export type AgentTraceStep = AgentToolTraceStep | AgentFinalTraceStep;

export interface AgentToolTraceStep {
  step: number;
  type: 'TOOL_CALL';
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface AgentFinalTraceStep {
  step: number;
  type: 'FINAL_ANSWER';
  answer: string;
  createdAt: string;
}

/** Best-effort action summaries. Concrete runtimes may persist / publish them as execution logs. */
export interface AgentTracePort {
  log(input: {
    workflowRunId?: string;
    nodeRunId?: string;
    level?: 'INFO' | 'WARN';
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/** Safe, bounded observation returned by a concrete Tool runtime. */
export interface AgentToolCallResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  output?: unknown;
  truncated?: boolean;
  error?: { code: string; message: string };
}

export interface AgentChatPort {
  generate(input: {
    modelId: string;
    messages: AgentMessage[];
    tools: AgentToolDefinition[];
    temperature?: number;
  }): Promise<AgentModelResponse>;
}

/** Keeps workflow-core independent of ToolRegistry, MCP and Nest. */
export interface AgentToolPort {
  listAllowed(input: { projectId: string; toolNames: string[] }): Promise<AgentToolDefinition[]>;
  execute(input: {
    projectId: string;
    workflowId?: string;
    workflowRunId?: string;
    nodeRunId?: string;
    workflowCallDepth: number;
    allowedToolNames: string[];
    call: AgentModelToolCall;
  }): Promise<AgentToolCallResult>;
}

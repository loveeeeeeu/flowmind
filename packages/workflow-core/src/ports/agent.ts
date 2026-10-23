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

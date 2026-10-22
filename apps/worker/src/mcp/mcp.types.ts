import type { Tool, ToolExecutionResult } from '@flowmind/shared';

export interface ResolvedMcpConnection { id: string; projectId: string; name: string; url: string; authType: 'NONE' | 'BEARER'; bearerToken: string | null; }
export interface McpRemoteTool { name: string; description?: string; inputSchema: Record<string, unknown>; }
export interface McpSession {
  listTools(): Promise<{ tools: McpRemoteTool[] }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<{ content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean }>;
  close(): Promise<void>;
}
export interface McpClientFactoryPort { connect(connection: ResolvedMcpConnection): Promise<McpSession>; }
export interface McpToolCallerPort { call(input: { projectId: string; connectionId: string; toolName: string; arguments: unknown }): Promise<ToolExecutionResult>; }
export interface ToolCatalogResult { tools: Tool[]; warnings: Array<{ source: 'MCP'; connectionId: string; code: string; message: string }>; }

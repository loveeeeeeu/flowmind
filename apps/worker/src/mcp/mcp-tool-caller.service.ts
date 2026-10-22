import { Injectable } from '@nestjs/common';
import { boundToolOutput, ToolRuntimeError } from '@flowmind/tool-runtime';
import { McpConnectionResolver } from './mcp-connection-resolver.service.js';
import { McpClientFactory } from './mcp-client.factory.js';
import type { McpToolCallerPort } from './mcp.types.js';

@Injectable()
export class McpToolCaller implements McpToolCallerPort {
  constructor(private readonly connections: McpConnectionResolver, private readonly factory: McpClientFactory) {}
  async call(input: { projectId: string; connectionId: string; toolName: string; arguments: unknown }) {
    const connection = await this.connections.resolve(input.projectId, input.connectionId);
    const session = await this.factory.connect(connection);
    try {
      const result = await session.callTool({ name: input.toolName, arguments: isRecord(input.arguments) ? input.arguments : {} });
      if (result.isError) throw new ToolRuntimeError('MCP_TOOL_ERROR', safeError(result.content));
      return boundToolOutput({ structuredContent: result.structuredContent ?? null, content: (result.content ?? []).map((item) => item.type === 'text' ? { type: 'text', text: item.text ?? '' } : { type: 'unsupported', originalType: item.type }) });
    } catch (error) {
      if (error instanceof ToolRuntimeError) throw error;
      throw new ToolRuntimeError('MCP_TOOL_NOT_FOUND', 'MCP tool could not be called');
    } finally { await session.close().catch(() => undefined); }
  }
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function safeError(content: Array<{ type: string; text?: string }> | undefined) {
  const text = content?.find((item) => item.type === 'text')?.text?.slice(0, 500);
  return text && !/\bat\s+\S+\(/.test(text) ? text : 'MCP tool failed';
}

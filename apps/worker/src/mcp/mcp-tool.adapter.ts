import type { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '@flowmind/shared';
import type { McpRemoteTool, McpToolCallerPort } from './mcp.types.js';

export function buildMcpToolName(connectionId: string, remoteName: string) { return `mcp__${connectionId}__${remoteName}`; }

export class McpToolAdapter implements Tool {
  readonly definition: ToolDefinition;
  constructor(private readonly connectionId: string, private readonly remoteName: string, remote: McpRemoteTool, private readonly caller: McpToolCallerPort) {
    this.definition = { name: buildMcpToolName(connectionId, remote.name), displayName: remote.name, source: 'MCP', description: remote.description ?? `MCP tool ${remote.name}`, inputSchema: remote.inputSchema as unknown as ToolDefinition['inputSchema'] };
  }
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    return this.caller.call({ projectId: context.projectId, connectionId: this.connectionId, toolName: this.remoteName, arguments: input });
  }
}

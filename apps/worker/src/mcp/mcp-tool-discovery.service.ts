import { Injectable, Logger } from '@nestjs/common';
import { ToolRuntimeError } from '@flowmind/tool-runtime';
import { PrismaService } from '../prisma/prisma.service.js';
import { McpConnectionResolver } from './mcp-connection-resolver.service.js';
import { McpClientFactory } from './mcp-client.factory.js';
import { McpToolAdapter } from './mcp-tool.adapter.js';
import { McpToolCaller } from './mcp-tool-caller.service.js';

export const MAX_MCP_TOOLS_PER_CONNECTION = 200;
export const MAX_MCP_TOOL_SCHEMA_CHARS = 20_000;

@Injectable()
export class McpToolDiscoveryService {
  private readonly logger = new Logger(McpToolDiscoveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly connections: McpConnectionResolver, private readonly factory: McpClientFactory, private readonly caller: McpToolCaller) {}

  async discoverProjectTools(projectId: string) {
    const connections = await this.prisma.mcpConnection.findMany({ where: { projectId, status: 'ACTIVE' }, select: { id: true } });
    const tools: McpToolAdapter[] = [];
    const warnings: Array<{ source: 'MCP'; connectionId: string; code: string; message: string }> = [];
    for (const connection of connections) {
      try { tools.push(...await this.discoverConnectionTools(projectId, connection.id)); }
      catch (error) {
        const code = error instanceof ToolRuntimeError ? error.code : 'MCP_CONNECTION_FAILED';
        warnings.push({ source: 'MCP', connectionId: connection.id, code, message: 'MCP connection is temporarily unavailable' });
        this.logger.warn(`MCP discovery failed for ${connection.id}: ${code}`);
      }
    }
    return { tools, warnings };
  }

  async discoverConnectionTools(projectId: string, connectionId: string): Promise<McpToolAdapter[]> {
    const connection = await this.connections.resolve(projectId, connectionId);
    const session = await this.factory.connect(connection);
    try {
      const { tools } = await session.listTools();
      if (tools.length > MAX_MCP_TOOLS_PER_CONNECTION) throw new ToolRuntimeError('MCP_TOO_MANY_TOOLS', 'MCP server exposes too many tools');
      return tools.map((remote) => {
        if (JSON.stringify(remote.inputSchema).length > MAX_MCP_TOOL_SCHEMA_CHARS) throw new ToolRuntimeError('MCP_TOOL_SCHEMA_TOO_LARGE', 'MCP tool schema is too large');
        return new McpToolAdapter(connectionId, remote.name, remote, this.caller);
      });
    } finally { await session.close().catch(() => undefined); }
  }
}

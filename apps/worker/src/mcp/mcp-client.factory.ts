import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ToolRuntimeError } from '@flowmind/tool-runtime';
import { HttpUrlSafetyService } from '../tools/http-url-safety.service.js';
import type { McpClientFactoryPort, McpSession, ResolvedMcpConnection } from './mcp.types.js';

@Injectable()
export class McpClientFactory implements McpClientFactoryPort {
  private readonly trustedProxyHosts: ReadonlySet<string>;

  constructor(private readonly urlSafety: HttpUrlSafetyService, config: ConfigService) {
    this.trustedProxyHosts = new Set(
      (config.get<string>('MCP_TRUSTED_PROXY_HOSTS', '') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async connect(connection: ResolvedMcpConnection): Promise<McpSession> {
    const url = await this.urlSafety.assertAllowed(connection.url, { trustedProxyHosts: this.trustedProxyHosts });
    if (url.protocol !== 'https:') throw new ToolRuntimeError('MCP_CONNECTION_FAILED', 'MCP connections must use HTTPS');
    const headers = connection.bearerToken ? { Authorization: `Bearer ${connection.bearerToken}` } : undefined;
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers, redirect: 'error' } });
    const client = new Client({ name: 'flowmind', version: '1.0.0' });
    try { await client.connect(transport); }
    catch { await transport.close().catch(() => undefined); throw new ToolRuntimeError('MCP_CONNECTION_FAILED', 'Could not connect to MCP server'); }
    return { listTools: () => client.listTools(), callTool: (input) => client.callTool(input), close: () => client.close() };
  }
}

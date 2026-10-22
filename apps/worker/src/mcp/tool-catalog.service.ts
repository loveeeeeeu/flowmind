import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '@flowmind/tool-runtime';
import { McpToolDiscoveryService } from './mcp-tool-discovery.service.js';

/** Merges fixed built-ins with short-lived project MCP discovery; dynamic tools never pollute the singleton registry. */
@Injectable()
export class ToolCatalogService {
  constructor(private readonly builtins: ToolRegistry, private readonly mcp: McpToolDiscoveryService) {}
  async listForProject(projectId: string) {
    const discovered = await this.mcp.discoverProjectTools(projectId);
    return { tools: [...this.builtins.list(), ...discovered.tools], warnings: discovered.warnings };
  }
}

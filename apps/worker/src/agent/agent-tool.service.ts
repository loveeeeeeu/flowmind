import { Injectable } from '@nestjs/common';
import type { Tool } from '@flowmind/shared';
import { ToolExecutor } from '@flowmind/tool-runtime';
import { WorkflowExecutionError, type AgentToolPort } from '@flowmind/workflow-core';
import { ToolCatalogService } from '../mcp/tool-catalog.service.js';

/** Enforces the Agent allow-list again after the model has emitted an untrusted tool call. */
@Injectable()
export class AgentToolService implements AgentToolPort {
  constructor(private readonly catalog: ToolCatalogService, private readonly builtinExecutor: ToolExecutor) {}

  async listAllowed(input: { projectId: string; toolNames: string[] }) {
    const catalog = await this.catalog.listForProject(input.projectId);
    return this.resolveAllowed(input.toolNames, catalog.tools).map((tool) => ({
      name: tool.definition.name, description: tool.definition.description, inputSchema: tool.definition.inputSchema as unknown as Record<string, unknown>,
    }));
  }

  async execute(input: Parameters<AgentToolPort['execute']>[0]) {
    const catalog = await this.catalog.listForProject(input.projectId);
    const tool = this.resolveAllowed(input.allowedToolNames, catalog.tools).find((item) => item.definition.name === input.call.name);
    if (!tool) {
      throw new WorkflowExecutionError('Tool is not allowed for this agent', {
        code: 'TOOL_NOT_ALLOWED',
        retryable: false,
      });
    }
    // Built-ins retain ToolExecutor's normalised error policy; dynamic MCP adapters execute with
    // the same trusted context but must not be added to the singleton process-wide registry.
    if (tool.definition.source === 'BUILT_IN') {
      return this.builtinExecutor.execute(input.call, this.context(input), new Set(input.allowedToolNames));
    }
    try {
      const result = await tool.execute(input.call.arguments, this.context(input));
      return { toolCallId: input.call.id, toolName: input.call.name, ok: true, output: result.output, ...(result.truncated === undefined ? {} : { truncated: result.truncated }) };
    } catch {
      return { toolCallId: input.call.id, toolName: input.call.name, ok: false, error: { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed' } };
    }
  }

  private resolveAllowed(names: string[], available: Tool[]) {
    const byName = new Map(available.map((tool) => [tool.definition.name, tool]));
    return names.map((name) => {
      const tool = byName.get(name);
      if (!tool) throw new WorkflowExecutionError(`Tool is not available: ${name}`, { code: 'AGENT_TOOL_NOT_AVAILABLE', retryable: false });
      return tool;
    });
  }
  private context(input: Parameters<AgentToolPort['execute']>[0]) {
    return { projectId: input.projectId, workflowId: input.workflowId, workflowRunId: input.workflowRunId, nodeRunId: input.nodeRunId, workflowCallDepth: input.workflowCallDepth };
  }
}

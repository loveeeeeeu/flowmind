import type { Tool, ToolDefinition } from '@flowmind/shared';
import { ToolNotFoundError } from './tool-runtime.error.js';

/** Name-to-Tool lookup only. Authorization and business validation belong outside this registry. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    const { name } = tool.definition;
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  getMany(names: readonly string[]): Tool[] {
    return names.map((name) => this.get(name));
  }

  /** Metadata-only projection safe to send to an LLM; stable ordering keeps tests and tracing deterministic. */
  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values(), (tool) => tool.definition)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

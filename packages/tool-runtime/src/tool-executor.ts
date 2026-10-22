import type { ToolCall, ToolCallResult, ToolExecutionContext } from '@flowmind/shared';
import { normalizeToolError, ToolNotAllowedError } from './tool-runtime.error.js';
import { ToolRegistry } from './tool-registry.js';

/** Converts an untrusted ToolCall into a safe, normalized observation for a future Agent loop. */
export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
    allowedToolNames?: ReadonlySet<string>,
  ): Promise<ToolCallResult> {
    try {
      if (allowedToolNames && !allowedToolNames.has(call.name)) {
        throw new ToolNotAllowedError(call.name);
      }
      const result = await this.registry.get(call.name).execute(call.arguments, context);
      return {
        toolCallId: call.id,
        toolName: call.name,
        ok: true,
        output: result.output,
        ...(result.truncated === undefined ? {} : { truncated: result.truncated }),
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        toolName: call.name,
        ok: false,
        error: normalizeToolError(error),
      };
    }
  }
}

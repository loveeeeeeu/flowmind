import type { Tool, ToolExecutionContext, ToolExecutionResult } from '@flowmind/shared';
import { ToolInputError } from '@flowmind/tool-runtime';

/** Minimal built-in tool used to verify the Tool Registry and executor without external effects. */
export class EchoTool implements Tool {
  readonly definition = {
    name: 'echo',
    displayName: 'Echo',
    description: 'Returns the provided text. Use only when the caller needs to echo text unchanged.',
    source: 'BUILT_IN',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to return unchanged.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  } as const;

  async execute(input: unknown, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!isRecord(input) || typeof input.text !== 'string' || Object.keys(input).some((key) => key !== 'text')) {
      throw new ToolInputError('Echo requires exactly one string field: text');
    }

    return { output: { text: input.text } };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

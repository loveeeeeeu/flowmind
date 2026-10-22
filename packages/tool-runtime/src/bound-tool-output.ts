import type { ToolExecutionResult } from '@flowmind/shared';

/**
 * A tool result is normally inserted into a model context. Keep the result small even when a
 * downstream service returns a very large object. The truncated representation intentionally
 * becomes a string instead of pretending that it is still the original JSON object.
 */
export function boundToolOutput(output: unknown, maxChars = 50_000): ToolExecutionResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(output);
  } catch {
    return { output: { text: '[Unserializable tool output]' }, truncated: true };
  }

  if (serialized.length <= maxChars) return { output, truncated: false };

  return {
    output: { text: serialized.slice(0, maxChars) },
    truncated: true,
  };
}

export class ToolRuntimeError extends Error {
  constructor(
    readonly code: 'TOOL_NOT_FOUND' | 'TOOL_NOT_ALLOWED' | 'TOOL_INPUT_INVALID' | 'TOOL_EXECUTION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ToolRuntimeError';
  }
}

export class ToolNotFoundError extends ToolRuntimeError {
  constructor(_name: string) {
    // Do not enumerate registered tools or expose internal registry details to an Agent.
    super('TOOL_NOT_FOUND', 'Tool not found');
    this.name = 'ToolNotFoundError';
  }
}

export class ToolNotAllowedError extends ToolRuntimeError {
  constructor(_name: string) {
    super('TOOL_NOT_ALLOWED', 'Tool is not allowed for this agent');
    this.name = 'ToolNotAllowedError';
  }
}

export class ToolInputError extends ToolRuntimeError {
  constructor(message = 'Tool input is invalid') {
    super('TOOL_INPUT_INVALID', message);
    this.name = 'ToolInputError';
  }
}

/** Preserve stable application error codes, but never return stack traces or causes to an Agent. */
export function normalizeToolError(error: unknown): { code: string; message: string } {
  if (error instanceof ToolRuntimeError) return { code: error.code, message: error.message };

  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return { code: candidate.code, message: candidate.message };
    }
  }

  return { code: 'TOOL_EXECUTION_FAILED', message: 'Tool execution failed' };
}

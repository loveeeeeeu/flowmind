export interface WorkflowExecutionErrorOptions {
  code?: string;
  retryable?: boolean;
  cause?: unknown;
}

export class WorkflowExecutionError extends Error {
  readonly code?: string;
  readonly retryable: boolean;

  constructor(message: string, options: WorkflowExecutionErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'WorkflowExecutionError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

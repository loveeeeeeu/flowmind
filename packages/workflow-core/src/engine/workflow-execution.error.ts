export class WorkflowExecutionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'WorkflowExecutionError';
    }
  }
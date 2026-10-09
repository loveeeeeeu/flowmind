import type { NodeExecutor } from '../executors/node-executor.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';

export class ExecutorRegistry {
  private readonly executors = new Map<string, NodeExecutor>();

  constructor(executors: NodeExecutor[]) {
    for (const executor of executors) {
      this.register(executor);
    }
  }

  has(nodeType: string) {
    return this.executors.has(nodeType);
  }

  get(nodeType: string): NodeExecutor {
    const executor = this.executors.get(nodeType);

    if (!executor) {
      throw new WorkflowExecutionError(`Unsupported node type: ${nodeType}`);
    }

    return executor;
  }

  private register(executor: NodeExecutor) {
    // A duplicate means two executors claim the same type: a startup bug, not a user error.
    if (this.executors.has(executor.type)) {
      throw new Error(`Duplicate executor type: ${executor.type}`);
    }

    this.executors.set(executor.type, executor);
  }
}

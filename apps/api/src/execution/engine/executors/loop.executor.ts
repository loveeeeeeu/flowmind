import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutionResult, NodeExecutor } from './node-executor.js';

interface LoopState {
  items: unknown[];
  index: number;
}

function requireName(nodeId: string, value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkflowExecutionError(`Loop node ${nodeId} has no ${field}`);
  }

  return value;
}

@Injectable()
export class LoopExecutor implements NodeExecutor {
  constructor(private readonly resolver: VariableResolver) {}

  async execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> {
    const itemsPath = requireName(node.id, node.data.itemsPath, 'itemsPath');
    const itemVariable = requireName(node.id, node.data.itemVariable, 'itemVariable');
    const indexVariable = requireName(node.id, node.data.indexVariable, 'indexVariable');

    if (itemVariable === indexVariable) {
      throw new WorkflowExecutionError(
        `Loop node ${node.id} itemVariable and indexVariable must be different`,
      );
    }

    const state =
      context.getNodeState<LoopState>(node.id) ?? this.createState(node.id, itemsPath, context);

    if (state.index >= state.items.length) {
      // Cleared so re-entering this loop later (e.g. inside an outer loop) starts from scratch.
      context.deleteNodeState(node.id);

      return {
        output: { completed: true, iterations: state.items.length },
        nextHandle: 'done',
      };
    }

    const item = state.items[state.index];
    const index = state.index;

    context.setVariable(itemVariable, item);
    context.setVariable(indexVariable, index);
    context.setNodeState(node.id, { items: state.items, index: index + 1 });

    return { output: { item, index }, nextHandle: 'body' };
  }

  private createState(nodeId: string, itemsPath: string, context: ExecutionContext): LoopState {
    const items = this.resolver.resolve(itemsPath, context);

    if (!Array.isArray(items)) {
      throw new WorkflowExecutionError(
        `Loop node ${nodeId} expected "${itemsPath}" to be an array`,
      );
    }

    return { items, index: 0 };
  }
}

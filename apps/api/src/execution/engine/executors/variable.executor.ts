import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '../execution-context.js';
import { VariableResolver } from '../variable-resolver.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutionResult, NodeExecutor } from './node-executor.js';

@Injectable()
export class VariableExecutor implements NodeExecutor {
  readonly type = 'variable';

  constructor(private readonly resolver: VariableResolver) {}

  async execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { variableName, value: rawValue } = node.data;
    const sourceType = node.data.sourceType ?? 'literal';

    if (typeof variableName !== 'string' || !variableName.trim()) {
      throw new WorkflowExecutionError(`Variable node ${node.id} has no variableName`);
    }

    const value = this.resolveValue(node.id, sourceType, rawValue, context);
    context.setVariable(variableName, value);

    return { output: { variableName, value } };
  }

  private resolveValue(
    nodeId: string,
    sourceType: unknown,
    rawValue: unknown,
    context: ExecutionContext,
  ): unknown {
    if (sourceType === 'literal') {
      return rawValue;
    }

    if (sourceType === 'reference') {
      if (typeof rawValue !== 'string' || !rawValue.trim()) {
        throw new WorkflowExecutionError(`Variable node ${nodeId} has no reference path`);
      }

      return this.resolver.resolve(rawValue, context);
    }

    throw new WorkflowExecutionError(
      `Variable node ${nodeId} has unsupported sourceType: ${String(sourceType)}`,
    );
  }
}
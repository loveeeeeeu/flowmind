import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import type { NodeExecutor } from './node-executor.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StartExecutor implements NodeExecutor {
  readonly type = 'start';

  async execute(node: WorkflowNode, context: ExecutionContext) {
    return { output: { nodeId: node.id, input: context.getVariables() } };
  }
}
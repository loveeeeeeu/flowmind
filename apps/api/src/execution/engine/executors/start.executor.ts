import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import type { NodeExecutor } from './node-executor.js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StartExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: ExecutionContext) {
    return {
      nodeId: node.id,
      input: context.getVariables(),
    };
  }
}
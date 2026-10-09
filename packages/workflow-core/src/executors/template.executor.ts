import type { ExecutionContext } from '../engine/execution-context.js';
import { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

export class TemplateExecutor implements NodeExecutor {
  readonly type = 'template';

  constructor(private readonly resolver: VariableResolver) {}

  async execute(node: WorkflowNode, context: ExecutionContext) {
    const template = node.data.template;
    const outputVariable = node.data.outputVariable;

    if (typeof template !== 'string') {
      throw new WorkflowExecutionError(`Template node ${node.id} has no valid template`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`Template node ${node.id} has no outputVariable`);
    }

    const rendered = this.resolver.resolveString(template, context);

    context.setVariable(outputVariable, rendered);

    return { output: rendered };
  }
}
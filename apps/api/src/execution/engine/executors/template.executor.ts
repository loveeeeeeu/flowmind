import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutor } from './node-executor.js';

export class TemplateExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: ExecutionContext) {
    const template = node.data.template;
    const outputVariable = node.data.outputVariable;

    if (typeof template !== 'string') {
      throw new WorkflowExecutionError(`Template node ${node.id} has no valid template`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`Template node ${node.id} has no outputVariable`);
    }

    const rendered = this.renderTemplate(template, context);

    context.setVariable(outputVariable, rendered);

    return rendered;
  }

  private renderTemplate(template: string, context: ExecutionContext) {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, variableName: string) => {
      const value = context.getVariable(variableName);

      if (value === undefined) {
        throw new WorkflowExecutionError(`Variable "${variableName}" not found`);
      }

      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
}
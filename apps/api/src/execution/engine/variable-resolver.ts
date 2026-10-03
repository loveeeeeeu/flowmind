import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from './execution-context.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';

@Injectable()
export class VariableResolver {
  resolveString(template: string, context: ExecutionContext) {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, variableName: string) => {
      const value = context.getVariable(variableName);

      if (value === undefined) {
        throw new WorkflowExecutionError(`Variable "${variableName}" not found`);
      }

      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
}

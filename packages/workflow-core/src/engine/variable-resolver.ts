import type { ExecutionContext } from './execution-context.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';

const TEMPLATE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;
const FULL_TEMPLATE_PATTERN = /^\{\{\s*([\w.-]+)\s*\}\}$/;
const SEGMENT_PATTERN = /^[\w-]+$/;

export class VariableResolver {
  resolve(path: string, context: ExecutionContext): unknown {
    const segments = path
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      throw new WorkflowExecutionError('Variable path is empty');
    }

    if (!segments.every((segment) => SEGMENT_PATTERN.test(segment))) {
      throw new WorkflowExecutionError(
        `Invalid variable path "${path}" (use a.b.0 form, without {{ }})`,
      );
    }

    const [rootName, ...rest] = segments;
    let current = context.getVariable(rootName);

    if (current === undefined) {
      throw new WorkflowExecutionError(`Variable "${rootName}" not found`);
    }

    for (const segment of rest) {
      current = this.getProperty(current, segment, path);
    }

    return current;
  }

  resolveString(template: string, context: ExecutionContext): string {
    return template.replace(TEMPLATE_PATTERN, (_match, path: string) =>
      this.stringify(this.resolve(path, context)),
    );
  }

  resolveTemplateValue(template: string, context: ExecutionContext): unknown {
    const match = template.match(FULL_TEMPLATE_PATTERN);

    return match ? this.resolve(match[1], context) : this.resolveString(template, context);
  }

  private getProperty(current: unknown, segment: string, fullPath: string): unknown {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        throw new WorkflowExecutionError(
          `Expected array index in "${fullPath}", got "${segment}"`,
        );
      }

      const index = Number(segment);

      if (index >= current.length) {
        throw new WorkflowExecutionError(
          `Array index "${index}" is out of range in "${fullPath}"`,
        );
      }

      return current[index];
    }

    if (current !== null && typeof current === 'object') {
      // Own properties only: blocks reading prototype members like "constructor" or "__proto__".
      if (!Object.hasOwn(current, segment)) {
        throw new WorkflowExecutionError(`Property "${segment}" not found in "${fullPath}"`);
      }

      return (current as Record<string, unknown>)[segment];
    }

    const kind = current === null ? 'null' : typeof current;
    throw new WorkflowExecutionError(
      `Cannot access "${segment}" on ${kind} value in "${fullPath}"`,
    );
  }

  private stringify(value: unknown) {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  }
}
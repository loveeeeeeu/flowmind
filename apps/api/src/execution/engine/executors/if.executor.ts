import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '../execution-context.js';
import type { WorkflowNode } from '../workflow-engine.types.js';
import { WorkflowExecutionError } from '../workflow-execution.error.js';
import type { NodeExecutionResult, NodeExecutor } from './node-executor.js';

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
const VALUE_TYPES = ['string', 'number', 'boolean'] as const;

type ConditionOperator = (typeof OPERATORS)[number];
type ValueType = (typeof VALUE_TYPES)[number];
type ComparableValue = string | number | boolean;

const NUMERIC_OPERATORS: readonly ConditionOperator[] = ['gt', 'gte', 'lt', 'lte'];

function isOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (OPERATORS as readonly string[]).includes(value);
}

function isValueType(value: unknown): value is ValueType {
  return typeof value === 'string' && (VALUE_TYPES as readonly string[]).includes(value);
}

@Injectable()
export class IfExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { variable, operator, value } = node.data;
    const valueType = node.data.valueType ?? 'string';

    if (typeof variable !== 'string' || !variable.trim()) {
      throw new WorkflowExecutionError(`IF node ${node.id} has no variable`);
    }

    if (!isOperator(operator)) {
      throw new WorkflowExecutionError(
        `IF node ${node.id} has unsupported operator: ${String(operator)}`,
      );
    }

    if (!isValueType(valueType)) {
      throw new WorkflowExecutionError(
        `IF node ${node.id} has unsupported valueType: ${String(valueType)}`,
      );
    }

    if (NUMERIC_OPERATORS.includes(operator) && valueType !== 'number') {
      throw new WorkflowExecutionError(
        `IF node ${node.id} operator "${operator}" requires valueType "number"`,
      );
    }

    const actualValue = context.getVariable(variable);

    if (actualValue === undefined) {
      throw new WorkflowExecutionError(`Variable "${variable}" not found`);
    }

    const actual = this.coerce(node.id, actualValue, valueType, `variable "${variable}"`);
    const expected = this.coerce(node.id, value, valueType, 'value');
    const matched = this.compare(operator, actual, expected);

    return {
      output: matched,
      nextHandle: matched ? 'true' : 'false',
    };
  }

  private coerce(nodeId: string, raw: unknown, valueType: ValueType, label: string): ComparableValue {
    switch (valueType) {
      case 'number': {
        const parsed = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;

        if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
          throw new WorkflowExecutionError(`IF node ${nodeId}: ${label} is not a number`);
        }

        return parsed;
      }

      case 'boolean':
        return raw === true || raw === 'true';

      case 'string':
        return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    }
  }

  private compare(operator: ConditionOperator, actual: ComparableValue, expected: ComparableValue) {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
    }
  }
}
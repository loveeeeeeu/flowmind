import type { ExecutionContext } from '../engine/execution-context.js';
import type { VariableResolver } from '../engine/variable-resolver.js';
import type { WorkflowNode } from '../engine/workflow-engine.types.js';
import { WorkflowExecutionError } from '../engine/workflow-execution.error.js';
import type { CodeRunner } from '../ports/code-runner.js';
import type { NodeExecutionResult, NodeExecutor } from './node-executor.js';

const DEFAULT_TIMEOUT_MS = 1000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 5000;
const MAX_CODE_LENGTH = 20_000;

export class CodeExecutor implements NodeExecutor {
  readonly type = 'code';

  constructor(
    private readonly codeRunner: CodeRunner,
    private readonly resolver: VariableResolver,
  ) {}

  async execute(node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> {
    const { code, inputPath, outputVariable } = node.data;

    if (typeof code !== 'string' || !code.trim()) {
      throw new WorkflowExecutionError(`Code node ${node.id} has no code`);
    }

    if (code.length > MAX_CODE_LENGTH) {
      throw new WorkflowExecutionError(
        `Code node ${node.id} exceeds maximum code length (${MAX_CODE_LENGTH})`,
      );
    }

    if (typeof inputPath !== 'string' || !inputPath.trim()) {
      throw new WorkflowExecutionError(`Code node ${node.id} has no inputPath`);
    }

    if (typeof outputVariable !== 'string' || !outputVariable.trim()) {
      throw new WorkflowExecutionError(`Code node ${node.id} has no outputVariable`);
    }

    const timeoutMs = this.resolveTimeout(node.id, node.data.timeoutMs);
    const input = this.resolver.resolve(inputPath, context);
    const { output } = await this.codeRunner.run({ code, input, timeoutMs });

    context.setVariable(outputVariable, output);

    return { output };
  }

  private resolveTimeout(nodeId: string, value: unknown): number {
    if (value === undefined) {
      return DEFAULT_TIMEOUT_MS;
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < MIN_TIMEOUT_MS ||
      value > MAX_TIMEOUT_MS
    ) {
      throw new WorkflowExecutionError(
        `Code node ${nodeId} timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
      );
    }

    return value;
  }
}

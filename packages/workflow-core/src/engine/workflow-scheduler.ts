import type { NodeExecutionResult, NodeExecutor } from '../executors/node-executor.js';
import type { ExecutionObserver } from '../ports/execution-observer.js';
import type { ExecutionContext } from './execution-context.js';
import type { ExecutorRegistry } from './executor-registry.js';
import {
  DEFAULT_NODE_RETRY_POLICY,
  isRetryableError,
  type NodeRetryPolicy,
} from './node-retry-policy.js';
import type { WorkflowEdge, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';
import type { WorkflowGraph } from './workflow-graph.js';

export const MAX_EXECUTION_STEPS = 10_000;

export interface SchedulerOptions {
  observer?: ExecutionObserver;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class WorkflowScheduler {
  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly retryPolicy: NodeRetryPolicy = DEFAULT_NODE_RETRY_POLICY,
  ) {}

  async run(
    graph: WorkflowGraph,
    startNode: WorkflowNode,
    context: ExecutionContext,
    options?: SchedulerOptions,
  ) {
    const observer = options?.observer;
    const executedNodeIds: string[] = [];
    let current: WorkflowNode | undefined = startNode;
    let steps = 0;
    let sequence = 0;

    while (current) {
      steps += 1;

      if (steps > MAX_EXECUTION_STEPS) {
        throw new WorkflowExecutionError(
          `Workflow exceeded maximum execution steps (${MAX_EXECUTION_STEPS})`,
        );
      }

      const executor = this.registry.get(current.type);
      const executionResult = await this.executeNodeWithRetry(
        current,
        executor,
        context,
        sequence,
        observer,
      );

      executedNodeIds.push(current.id);
      sequence += 1;

      if (current.type === 'end') {
        return { result: executionResult.output, executedNodeIds };
      }

      current = this.findNextNode(graph, current, executionResult.nextHandle);
    }

    throw new WorkflowExecutionError('Workflow finished without reaching end node');
  }

  /**
   * Every attempt is reported separately (same sequence, increasing attempt), so a step that
   * failed once and then succeeded leaves both facts in the trace. Only the final failure
   * propagates and fails the run.
   */
  private async executeNodeWithRetry(
    node: WorkflowNode,
    executor: NodeExecutor,
    context: ExecutionContext,
    sequence: number,
    observer: ExecutionObserver | undefined,
  ): Promise<NodeExecutionResult> {
    const retryMode = executor.getRetryMode?.(node) ?? 'none';
    const { maxAttempts } = this.retryPolicy;

    for (let attempt = 1; ; attempt += 1) {
      await observer?.onNodeStart?.({ node, sequence, attempt });

      try {
        const result = await executor.execute(node, context);

        context.setNodeOutput(node.id, result.output);
        await observer?.onNodeSuccess?.({ node, sequence, attempt, output: result.output });

        return result;
      } catch (error) {
        const willRetry =
          retryMode === 'transient' && isRetryableError(error) && attempt < maxAttempts;

        if (!willRetry) {
          await observer?.onNodeFailure?.({ node, sequence, attempt, error, willRetry });
          throw error;
        }

        const retryDelayMs = this.retryPolicy.backoffMs(attempt);

        await observer?.onNodeFailure?.({ node, sequence, attempt, error, willRetry, retryDelayMs });
        await sleep(retryDelayMs);
      }
    }
  }

  private findNextNode(graph: WorkflowGraph, node: WorkflowNode, nextHandle?: string) {
    const edge = this.selectEdge(node, graph.getOutgoingEdges(node.id), nextHandle);
    return graph.getNode(edge.target);
  }

  private selectEdge(node: WorkflowNode, edges: WorkflowEdge[], nextHandle?: string) {
    if (nextHandle !== undefined) {
      const edge = edges.find((item) => item.sourceHandle === nextHandle);

      if (!edge) {
        throw new WorkflowExecutionError(`Node ${node.id} has no edge for handle "${nextHandle}"`);
      }

      return edge;
    }

    if (edges.length !== 1) {
      throw new WorkflowExecutionError(`Node ${node.id} must have exactly one outgoing edge`);
    }

    return edges[0];
  }
}

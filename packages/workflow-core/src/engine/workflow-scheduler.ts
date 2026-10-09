import type { NodeExecutionResult } from '../executors/node-executor.js';
import type { ExecutionObserver } from '../ports/execution-observer.js';
import type { ExecutionContext } from './execution-context.js';
import type { ExecutorRegistry } from './executor-registry.js';
import type { WorkflowEdge, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';
import type { WorkflowGraph } from './workflow-graph.js';

export const MAX_EXECUTION_STEPS = 10_000;

export interface SchedulerOptions {
  observer?: ExecutionObserver;
}

export class WorkflowScheduler {
  constructor(private readonly registry: ExecutorRegistry) {}

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

      await observer?.onNodeStart?.({ node: current, sequence });

      let executionResult: NodeExecutionResult;

      try {
        executionResult = await executor.execute(current, context);
      } catch (error) {
        await observer?.onNodeFailure?.({ node: current, sequence, error });
        throw error;
      }

      context.setNodeOutput(current.id, executionResult.output);
      await observer?.onNodeSuccess?.({ node: current, sequence, output: executionResult.output });

      executedNodeIds.push(current.id);
      sequence += 1;

      if (current.type === 'end') {
        return { result: executionResult.output, executedNodeIds };
      }

      current = this.findNextNode(graph, current, executionResult.nextHandle);
    }

    throw new WorkflowExecutionError('Workflow finished without reaching end node');
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

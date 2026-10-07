import { Injectable, Optional } from '@nestjs/common';
import type { ExecutionContext } from './execution-context.js';
import { ExecutorRegistry } from './executor-registry.js';
import type { WorkflowEdge, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';
import type { WorkflowGraph } from './workflow-graph.js';
import { ExecutionTracker } from '../run/execution-tracker.js';

export const MAX_EXECUTION_STEPS = 10_000;

export interface SchedulerOptions {
  workflowRunId?: string;
}

@Injectable()
export class WorkflowScheduler {
  constructor(
    private readonly registry: ExecutorRegistry,
    @Optional() private readonly tracker?: ExecutionTracker,
  ) {}

  async run(
    graph: WorkflowGraph,
    startNode: WorkflowNode,
    context: ExecutionContext,
    options?: SchedulerOptions,
  ) {
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
      const workflowRunId = options?.workflowRunId;
      const tracker = workflowRunId ? this.tracker : undefined;
      const nodeRun =
        tracker && workflowRunId
          ? await tracker.startNode({
              workflowRunId,
              nodeId: current.id,
              nodeType: current.type,
              sequence,
            })
          : undefined;

      try {
        const executionResult = await executor.execute(current, context);
        context.setNodeOutput(current.id, executionResult.output);

        if (tracker && nodeRun) {
          await tracker.completeNode(nodeRun.id, executionResult.output);
        }

        executedNodeIds.push(current.id);
        sequence += 1;

        if (current.type === 'end') {
          return { result: executionResult.output, executedNodeIds };
        }

        current = this.findNextNode(graph, current, executionResult.nextHandle);
      } catch (error) {
        if (tracker && nodeRun) {
          await tracker.failNode(nodeRun.id, error);
        }

        throw error;
      }
    }

    throw new WorkflowExecutionError(
      'Workflow finished without reaching end node',
    );
  }

  private findNextNode(
    graph: WorkflowGraph,
    node: WorkflowNode,
    nextHandle?: string,
  ) {
    const edge = this.selectEdge(
      node,
      graph.getOutgoingEdges(node.id),
      nextHandle,
    );
    return graph.getNode(edge.target);
  }

  private selectEdge(
    node: WorkflowNode,
    edges: WorkflowEdge[],
    nextHandle?: string,
  ) {
    if (nextHandle !== undefined) {
      const edge = edges.find((item) => item.sourceHandle === nextHandle);

      if (!edge) {
        throw new WorkflowExecutionError(
          `Node ${node.id} has no edge for handle "${nextHandle}"`,
        );
      }

      return edge;
    }

    if (edges.length !== 1) {
      throw new WorkflowExecutionError(
        `Node ${node.id} must have exactly one outgoing edge`,
      );
    }

    return edges[0];
  }
}

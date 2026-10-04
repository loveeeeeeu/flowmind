import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from './execution-context.js';
import type { NodeExecutor } from './executors/node-executor.js';
import type { WorkflowEdge, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowExecutionError } from './workflow-execution.error.js';
import type { WorkflowGraph } from './workflow-graph.js';

@Injectable()
export class WorkflowScheduler {
  async run(
    graph: WorkflowGraph,
    startNode: WorkflowNode,
    executors: Map<string, NodeExecutor>,
    context: ExecutionContext,
  ) {
    const executedNodeIds: string[] = [];
    let current: WorkflowNode | undefined = startNode;

    while (current) {
      const executor = executors.get(current.type);

      if (!executor) {
        throw new WorkflowExecutionError(`Unsupported node type: ${current.type}`);
      }

      const executionResult = await executor.execute(current, context);
      executedNodeIds.push(current.id);
      context.setNodeOutput(current.id, executionResult.output);

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

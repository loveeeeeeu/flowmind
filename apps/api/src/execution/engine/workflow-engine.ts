import { Injectable } from '@nestjs/common';
import { ExecutionContext } from './execution-context.js';
import { EndExecutor } from './executors/end.executor.js';
import { LlmExecutor } from './executors/llm.executor.js';
import type { NodeExecutor } from './executors/node-executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import { VariableExecutor } from './executors/variable.executor.js';
import type { WorkflowCanvas, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { WorkflowValidationError } from './workflow-validation.error.js';
import { HttpExecutor } from './executors/http.executor.js';

@Injectable()
export class WorkflowEngine {
  private readonly executors: Map<string, NodeExecutor>;

  constructor(
    startExecutor: StartExecutor,
    variableExecutor: VariableExecutor,
    templateExecutor: TemplateExecutor,
    httpExecutor: HttpExecutor,
    llmExecutor: LlmExecutor,
    endExecutor: EndExecutor,
  ) {
    this.executors = new Map<string, NodeExecutor>([
      ['start', startExecutor],
      ['variable', variableExecutor],
      ['template', templateExecutor],
      ['http', httpExecutor],
      ['llm', llmExecutor],
      ['end', endExecutor],
    ]);
  }

  async execute(canvas: WorkflowCanvas, input: Record<string, unknown>) {
    const executionPlan = this.buildExecutionPlan(canvas);

    for (const node of executionPlan) {
      if (!this.executors.has(node.type)) {
        throw new WorkflowValidationError(`Unsupported node type: ${node.type}`);
      }
    }

    const context = new ExecutionContext(input);
    let finalResult: unknown = null;

    for (const node of executionPlan) {
      const executor = this.executors.get(node.type)!;
      const output = await executor.execute(node, context);

      context.setNodeOutput(node.id, output);

      if (node.type === 'end') {
        finalResult = output;
      }
    }

    return {
      result: finalResult,
      variables: context.getVariables(),
      nodeOutputs: context.getNodeOutputs(),
    };
  }

  buildExecutionPlan(canvas: WorkflowCanvas): WorkflowNode[] {
    if (!Array.isArray(canvas?.nodes) || !Array.isArray(canvas?.edges)) {
      throw new WorkflowValidationError('Workflow canvas is malformed');
    }

    if (canvas.nodes.length === 0) {
      throw new WorkflowValidationError('Workflow has no nodes');
    }

    const graph = new WorkflowGraph(canvas);
    const { startId, endId } = this.validateBasicStructure(canvas, graph);

    // Cycle first: clearer error than "cannot reach end" for cyclic graphs.
    const executionPlan = this.topologicalSort(graph);

    this.validateReachability(graph, startId, endId);

    return executionPlan;
  }

  private validateBasicStructure(canvas: WorkflowCanvas, graph: WorkflowGraph) {
    const startNodes = canvas.nodes.filter((node) => node.type === 'start');
    const endNodes = canvas.nodes.filter((node) => node.type === 'end');

    if (startNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one start node');
    }

    if (endNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one end node');
    }

    const startId = startNodes[0].id;
    const endId = endNodes[0].id;

    this.validateStartAndEnd(graph, startId, endId);

    return { startId, endId };
  }

  private validateStartAndEnd(graph: WorkflowGraph, startId: string, endId: string) {
    if (graph.getInDegree(startId) !== 0) {
      throw new WorkflowValidationError('Start node cannot have incoming edges');
    }

    if (graph.getNextNodes(endId).length !== 0) {
      throw new WorkflowValidationError('End node cannot have outgoing edges');
    }
  }

  private collectReachableNodes(startId: string, getNeighbors: (id: string) => string[]) {
    const visited = new Set<string>();
    const stack = [startId];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      for (const neighbor of getNeighbors(current)) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    return visited;
  }

  private validateReachability(graph: WorkflowGraph, startId: string, endId: string) {
    const allNodes = graph.getNodes();

    const reachableFromStart = this.collectReachableNodes(startId, (nodeId) =>
      graph.getNextNodes(nodeId),
    );

    for (const node of allNodes) {
      if (!reachableFromStart.has(node.id)) {
        throw new WorkflowValidationError(`Node ${node.id} is not reachable from start`);
      }
    }

    // Walk backward from End using reverse adjacency.
    const canReachEnd = this.collectReachableNodes(endId, (nodeId) =>
      graph.getPreviousNodes(nodeId),
    );

    for (const node of allNodes) {
      if (!canReachEnd.has(node.id)) {
        throw new WorkflowValidationError(`Node ${node.id} cannot reach end`);
      }
    }
  }

  topologicalSort(graph: WorkflowGraph): WorkflowNode[] {
    const inDegree = graph.getInDegreeMap();
    const queue: string[] = [];

    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: WorkflowNode[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = graph.getNode(nodeId);

      if (!node) {
        continue;
      }

      result.push(node);

      for (const nextId of graph.getNextNodes(nodeId)) {
        const nextDegree = (inDegree.get(nextId) ?? 0) - 1;
        inDegree.set(nextId, nextDegree);

        if (nextDegree === 0) {
          queue.push(nextId);
        }
      }
    }

    if (result.length !== graph.getNodes().length) {
      const unresolved = [...inDegree]
        .filter(([, degree]) => degree > 0)
        .map(([nodeId]) => nodeId);

      throw new WorkflowValidationError(
        `Workflow contains a cycle (unresolved nodes: ${unresolved.join(', ')})`,
      );
    }

    return result;
  }
}
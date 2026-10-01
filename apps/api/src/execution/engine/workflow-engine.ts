import { ExecutionContext } from './execution-context.js';
import { EndExecutor } from './executors/end.executor.js';
import type { NodeExecutor } from './executors/node-executor.js';
import { StartExecutor } from './executors/start.executor.js';
import { TemplateExecutor } from './executors/template.executor.js';
import type { WorkflowCanvas, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { WorkflowValidationError } from './workflow-validation.error.js';

export class WorkflowEngine {
  private readonly executors = new Map<string, NodeExecutor>([
    ['start', new StartExecutor()],
    ['template', new TemplateExecutor()],
    ['end', new EndExecutor()],
  ]);

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
    this.validate(canvas);

    const graph = new WorkflowGraph(canvas);

    return this.topologicalSort(graph);
  }

  validate(canvas: WorkflowCanvas) {
    if (!Array.isArray(canvas?.nodes) || !Array.isArray(canvas?.edges)) {
      throw new WorkflowValidationError('Workflow canvas is malformed');
    }

    if (canvas.nodes.length === 0) {
      throw new WorkflowValidationError('Workflow has no nodes');
    }

    const startNodes = canvas.nodes.filter((node) => node.type === 'start');
    const endNodes = canvas.nodes.filter((node) => node.type === 'end');

    if (startNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one start node');
    }

    if (endNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one end node');
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
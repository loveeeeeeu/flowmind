import type { WorkflowCanvas, WorkflowEdge, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowValidationError } from './workflow-validation.error.js';

export class WorkflowGraph {
  private readonly nodeMap = new Map<string, WorkflowNode>();
  private readonly outgoingEdges = new Map<string, WorkflowEdge[]>();
  private readonly incomingEdges = new Map<string, WorkflowEdge[]>();
  private readonly inDegree = new Map<string, number>();

  constructor(private readonly canvas: WorkflowCanvas) {
    this.build();
  }

  private build() {
    for (const node of this.canvas.nodes) {
      if (this.nodeMap.has(node.id)) {
        throw new WorkflowValidationError(`Duplicate node id ${node.id}`);
      }

      this.nodeMap.set(node.id, node);
      this.outgoingEdges.set(node.id, []);
      this.incomingEdges.set(node.id, []);
      this.inDegree.set(node.id, 0);
    }

    for (const edge of this.canvas.edges) {
      const outgoing = this.outgoingEdges.get(edge.source);
      if (!outgoing) {
        throw new WorkflowValidationError(`Source node ${edge.source} does not exist`);
      }

      const incoming = this.incomingEdges.get(edge.target);
      if (!incoming) {
        throw new WorkflowValidationError(`Target node ${edge.target} does not exist`);
      }

      outgoing.push(edge);
      incoming.push(edge);
      this.inDegree.set(edge.target, (this.inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  getNode(id: string) {
    return this.nodeMap.get(id);
  }

  getNodes() {
    return [...this.nodeMap.values()];
  }

  getOutgoingEdges(id: string): WorkflowEdge[] {
    return this.outgoingEdges.get(id) ?? [];
  }

  getIncomingEdges(id: string): WorkflowEdge[] {
    return this.incomingEdges.get(id) ?? [];
  }

  getNextNodes(id: string): string[] {
    return this.getOutgoingEdges(id).map((edge) => edge.target);
  }

  getPreviousNodes(id: string): string[] {
    return this.getIncomingEdges(id).map((edge) => edge.source);
  }

  getInDegree(id: string) {
    return this.inDegree.get(id) ?? 0;
  }

  isLoopBackEdge(edge: WorkflowEdge) {
    return edge.targetHandle === 'loop' && this.getNode(edge.target)?.type === 'loop';
  }

  getStructuralNextNodes(id: string): string[] {
    return this.getOutgoingEdges(id)
      .filter((edge) => !this.isLoopBackEdge(edge))
      .map((edge) => edge.target);
  }

  getStructuralInDegreeMap() {
    const result = new Map<string, number>();

    for (const id of this.nodeMap.keys()) {
      result.set(id, 0);
    }

    for (const edge of this.canvas.edges) {
      if (!this.isLoopBackEdge(edge)) {
        result.set(edge.target, (result.get(edge.target) ?? 0) + 1);
      }
    }

    return result;
  }
}
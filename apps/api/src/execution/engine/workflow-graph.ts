import type { WorkflowCanvas, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowValidationError } from './workflow-validation.error.js';

export class WorkflowGraph {
  private readonly nodeMap = new Map<string, WorkflowNode>();
  private readonly adjacency = new Map<string, string[]>();
  private readonly reverseAdjacency = new Map<string, string[]>();
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
      this.adjacency.set(node.id, []);
      this.reverseAdjacency.set(node.id, []);
      this.inDegree.set(node.id, 0);
    }

    for (const edge of this.canvas.edges) {
      const sourceTargets = this.adjacency.get(edge.source);
      if (!sourceTargets) {
        throw new WorkflowValidationError(`Source node ${edge.source} does not exist`);
      }

      const targetSources = this.reverseAdjacency.get(edge.target);
      if (!targetSources) {
        throw new WorkflowValidationError(`Target node ${edge.target} does not exist`);
      }

      sourceTargets.push(edge.target);
      targetSources.push(edge.source);
      this.inDegree.set(edge.target, (this.inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  getNode(id: string) {
    return this.nodeMap.get(id);
  }

  getNodes() {
    return [...this.nodeMap.values()];
  }

  getNextNodes(id: string): string[] {
    return this.adjacency.get(id) ?? [];
  }

  getPreviousNodes(id: string): string[] {
    return this.reverseAdjacency.get(id) ?? [];
  }

  getInDegree(id: string) {
    return this.inDegree.get(id) ?? 0;
  }

  getInDegreeMap() {
    return new Map(this.inDegree);
  }
}
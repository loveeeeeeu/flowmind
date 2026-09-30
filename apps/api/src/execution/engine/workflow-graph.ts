import type { WorkflowCanvas, WorkflowNode } from './workflow-engine.types.js';
import { WorkflowValidationError } from './workflow-validation.error.js';

export class WorkflowGraph {
  private readonly nodeMap = new Map<string, WorkflowNode>();
  private readonly adjacency = new Map<string, string[]>();
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
      this.inDegree.set(node.id, 0);
    }

    for (const edge of this.canvas.edges) {
      const targets = this.adjacency.get(edge.source);

      if (!targets) {
        throw new WorkflowValidationError(`Source node ${edge.source} does not exist`);
      }

      if (!this.nodeMap.has(edge.target)) {
        throw new WorkflowValidationError(`Target node ${edge.target} does not exist`);
      }

      targets.push(edge.target);
      this.inDegree.set(edge.target, (this.inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  getNode(id: string) {
    return this.nodeMap.get(id);
  }

  getNextNodes(id: string): string[] {
    return this.adjacency.get(id) ?? [];
  }

  getInDegreeMap() {
    return new Map(this.inDegree);
  }

  getNodes() {
    return [...this.nodeMap.values()];
  }
}
import { SUPPORTED_NODE_TYPES } from '../node-types.js';
import type { WorkflowNode } from './workflow-engine.types.js';
import type { WorkflowGraph } from './workflow-graph.js';
import { WorkflowValidationError } from './workflow-validation.error.js';

export interface WorkflowValidationResult {
  startNode: WorkflowNode;
  endNode: WorkflowNode;
  executionPlan: WorkflowNode[];
}

/** Static structure checks only: never calls executors or external services. */
export class WorkflowValidator {
  private readonly supportedNodeTypes: ReadonlySet<string>;

  constructor(supportedNodeTypes: Iterable<string> = SUPPORTED_NODE_TYPES) {
    this.supportedNodeTypes = new Set(supportedNodeTypes);
  }

  validate(graph: WorkflowGraph): WorkflowValidationResult {
    if (graph.getNodes().length === 0) {
      throw new WorkflowValidationError('Workflow has no nodes');
    }

    const { startNode, endNode } = this.validateBasicStructure(graph);
    // Cycle first: clearer error than "cannot reach end" for cyclic graphs.
    const executionPlan = this.validateAcyclicStructure(graph);

    this.validateReachability(graph, startNode.id, endNode.id);
    this.validateNodeTypes(graph);
    this.validateNodeConfig(graph);
    this.validateRuntimeStructure(graph);

    return { startNode, endNode, executionPlan };
  }

  private validateBasicStructure(graph: WorkflowGraph) {
    const nodes = graph.getNodes();
    const startNodes = nodes.filter((node) => node.type === 'start');
    const endNodes = nodes.filter((node) => node.type === 'end');

    if (startNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one start node');
    }

    if (endNodes.length !== 1) {
      throw new WorkflowValidationError('Workflow must have exactly one end node');
    }

    const [startNode] = startNodes;
    const [endNode] = endNodes;

    if (graph.getInDegree(startNode.id) !== 0) {
      throw new WorkflowValidationError('Start node cannot have incoming edges');
    }

    if (graph.getOutgoingEdges(endNode.id).length !== 0) {
      throw new WorkflowValidationError('End node cannot have outgoing edges');
    }

    return { startNode, endNode };
  }

  private validateAcyclicStructure(graph: WorkflowGraph): WorkflowNode[] {
    const inDegree = graph.getStructuralInDegreeMap();
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

      for (const nextId of graph.getStructuralNextNodes(nodeId)) {
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

  private validateNodeTypes(graph: WorkflowGraph) {
    for (const node of graph.getNodes()) {
      if (!this.supportedNodeTypes.has(node.type)) {
        throw new WorkflowValidationError(`Unsupported node type: ${node.type}`);
      }
    }
  }

  /**
   * Shape only. Whether a modelId exists or is usable needs the database, so the API checks that
   * separately (resource validation).
   */
  private validateNodeConfig(graph: WorkflowGraph) {
    for (const node of graph.getNodes()) {
      if (node.type === 'llm') {
        this.validateLlmNode(node);
      }
      if (node.type === 'knowledgeRetriever') {
        this.validateKnowledgeRetrieverNode(node);
      }
    }
  }

  private validateLlmNode(node: WorkflowNode) {
    const { modelId, prompt, provider, model } = node.data;

    if (typeof modelId !== 'string' || !modelId.trim()) {
      const legacy = typeof provider === 'string' || typeof model === 'string';

      throw new WorkflowValidationError(
        legacy
          ? `LLM node ${node.id} uses the legacy provider/model configuration; select a model from Model Center`
          : `LLM node ${node.id} requires modelId`,
      );
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new WorkflowValidationError(`LLM node ${node.id} requires prompt`);
    }
  }

  private validateKnowledgeRetrieverNode(node: WorkflowNode) {
    const { knowledgeBaseId, query, outputVariable, topK, minScore } = node.data;

    if (typeof knowledgeBaseId !== 'string' || !knowledgeBaseId.trim()) {
      throw new WorkflowValidationError(`KNOWLEDGE_BASE_REQUIRED: Retriever node ${node.id} requires knowledgeBaseId`);
    }
    if (typeof query !== 'string' || !query.trim()) {
      throw new WorkflowValidationError(`KNOWLEDGE_QUERY_REQUIRED: Retriever node ${node.id} requires query`);
    }
    if (outputVariable !== undefined && (typeof outputVariable !== 'string' || !outputVariable.trim())) {
      throw new WorkflowValidationError(`KNOWLEDGE_OUTPUT_VARIABLE_REQUIRED: Retriever node ${node.id} outputVariable must be a non-empty string`);
    }
    if (topK !== undefined && (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 20)) {
      throw new WorkflowValidationError(`INVALID_KNOWLEDGE_TOP_K: Retriever node ${node.id} topK must be between 1 and 20`);
    }
    if (minScore !== undefined && (typeof minScore !== 'number' || !Number.isFinite(minScore) || minScore < -1 || minScore > 1)) {
      throw new WorkflowValidationError(`INVALID_KNOWLEDGE_MIN_SCORE: Retriever node ${node.id} minScore must be between -1 and 1`);
    }
  }

  private validateRuntimeStructure(graph: WorkflowGraph) {
    for (const node of graph.getNodes()) {
      if (node.type === 'end') {
        continue;
      }

      if (node.type === 'if') {
        this.validateIfNode(graph, node.id);
        continue;
      }

      if (node.type === 'loop') {
        this.validateLoopNode(graph, node.id);
        continue;
      }

      if (graph.getOutgoingEdges(node.id).length !== 1) {
        throw new WorkflowValidationError(`Node ${node.id} must have exactly one outgoing edge`);
      }
    }
  }

  private validateIfNode(graph: WorkflowGraph, nodeId: string) {
    const outgoing = graph.getOutgoingEdges(nodeId);
    const trueEdges = outgoing.filter((edge) => edge.sourceHandle === 'true');
    const falseEdges = outgoing.filter((edge) => edge.sourceHandle === 'false');

    if (trueEdges.length !== 1 || falseEdges.length !== 1) {
      throw new WorkflowValidationError(
        `IF node ${nodeId} must have exactly one true edge and one false edge`,
      );
    }

    if (outgoing.length !== 2) {
      throw new WorkflowValidationError(`IF node ${nodeId} can only have true and false edges`);
    }
  }

  private validateLoopNode(graph: WorkflowGraph, nodeId: string) {
    const outgoing = graph.getOutgoingEdges(nodeId);
    const bodyEdges = outgoing.filter((edge) => edge.sourceHandle === 'body');
    const doneEdges = outgoing.filter((edge) => edge.sourceHandle === 'done');

    if (bodyEdges.length !== 1 || doneEdges.length !== 1) {
      throw new WorkflowValidationError(
        `Loop node ${nodeId} must have exactly one body edge and one done edge`,
      );
    }

    if (outgoing.length !== 2) {
      throw new WorkflowValidationError(`Loop node ${nodeId} can only have body and done edges`);
    }

    const incoming = graph.getIncomingEdges(nodeId);
    const loopBackEdges = incoming.filter((edge) => graph.isLoopBackEdge(edge));

    if (loopBackEdges.length !== 1) {
      throw new WorkflowValidationError(`Loop node ${nodeId} must have exactly one loop-back edge`);
    }

    if (incoming.length === loopBackEdges.length) {
      throw new WorkflowValidationError(`Loop node ${nodeId} has no entry edge`);
    }

    const structuralNext = (id: string) => graph.getStructuralNextNodes(id);
    const fromBody = this.collectReachableNodes(bodyEdges[0].target, structuralNext);
    const fromDone = this.collectReachableNodes(doneEdges[0].target, structuralNext);
    const loopBackSource = loopBackEdges[0].source;

    // A loop-back reachable from "done" would restart the loop forever.
    if (!fromBody.has(loopBackSource) || fromDone.has(loopBackSource)) {
      throw new WorkflowValidationError(
        `Loop node ${nodeId} loop-back edge must come from the body branch`,
      );
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
}

export class ExecutionContext {
    private readonly variables = new Map<string, unknown>();
    private readonly nodeOutputs = new Map<string, unknown>();
    private readonly nodeStates = new Map<string, unknown>();
  
    readonly projectId: string | undefined;
    readonly workflowId: string | undefined;
    readonly workflowRunId: string | undefined;
    readonly workflowCallDepth: number;
    private currentNodeRunIdValue: string | undefined;

    constructor(input: Record<string, unknown>, options: { projectId?: string; workflowId?: string; workflowRunId?: string; workflowCallDepth?: number } | string = {}) {
      const metadata = typeof options === 'string' ? { projectId: options } : options;
      this.projectId = metadata.projectId;
      this.workflowId = metadata.workflowId;
      this.workflowRunId = metadata.workflowRunId;
      this.workflowCallDepth = metadata.workflowCallDepth ?? 0;
      for (const [key, value] of Object.entries(input)) {
        this.variables.set(key, value);
      }
    }
  
    getVariable(key: string): unknown {
      return this.variables.get(key);
    }
  
    setVariable(key: string, value: unknown) {
      this.variables.set(key, value);
    }
  
    getVariables() {
      return Object.fromEntries(this.variables.entries());
    }
  
    setNodeOutput(nodeId: string, output: unknown) {
      this.nodeOutputs.set(nodeId, output);
    }
  
    getNodeOutput(nodeId: string) {
      return this.nodeOutputs.get(nodeId);
    }
  
    getNodeOutputs() {
      return Object.fromEntries(this.nodeOutputs.entries());
    }

    getNodeState<T>(nodeId: string): T | undefined {
      return this.nodeStates.get(nodeId) as T | undefined;
    }

    setNodeState(nodeId: string, state: unknown) {
      this.nodeStates.set(nodeId, state);
    }

    deleteNodeState(nodeId: string) {
      this.nodeStates.delete(nodeId);
    }

    get currentNodeRunId() { return this.currentNodeRunIdValue; }
    setCurrentNodeRunId(nodeRunId: string | undefined) { this.currentNodeRunIdValue = nodeRunId; }
  }

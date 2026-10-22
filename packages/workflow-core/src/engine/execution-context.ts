export class ExecutionContext {
    private readonly variables = new Map<string, unknown>();
    private readonly nodeOutputs = new Map<string, unknown>();
    private readonly nodeStates = new Map<string, unknown>();
  
    readonly projectId: string | undefined;

    constructor(input: Record<string, unknown>, projectId?: string) {
      this.projectId = projectId;
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
  }

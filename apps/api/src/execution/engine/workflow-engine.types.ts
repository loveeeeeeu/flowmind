export interface WorkflowNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
  }
  
  export interface WorkflowEdge {
    id?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }
  
  export interface WorkflowCanvas {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }
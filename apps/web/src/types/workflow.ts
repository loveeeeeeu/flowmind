export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowListResponse {
  items: Workflow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
}
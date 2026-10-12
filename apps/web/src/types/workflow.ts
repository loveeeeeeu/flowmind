import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Workflow {
    id: string;
    name: string;
    description: string | null;
    status: WorkflowStatus;
    /** The editable draft; published versions are separate immutable snapshots. */
    draftCanvas: WorkflowCanvas | null;
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

export interface UpdateWorkflowInput {
  name?: string;
  description?: string | null;
}
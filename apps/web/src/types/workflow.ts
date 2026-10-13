import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';
import type { WorkflowVersionSummary } from './run';

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

/** GET /workflows/:id only: list items do not carry version information. */
export interface WorkflowDetail extends Workflow {
  /** Highest published version, or null if the workflow was never published (it cannot run). */
  latestVersion: WorkflowVersionSummary | null;
}

export interface PublishedWorkflowVersion extends WorkflowVersionSummary {
  workflowId: string;
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
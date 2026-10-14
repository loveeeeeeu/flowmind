import type { WorkflowCanvas } from '../workflow/types/workflowCanvas';

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Workflow {
    id: string;
    name: string;
    description: string | null;
    status: WorkflowStatus;
    /** The editable draft; published versions are separate immutable snapshots. */
    draftCanvas: WorkflowCanvas | null;
    /** Bumped on every draft save; compared with latestVersion.draftRevision. */
    draftRevision: number;
    createdAt: string;
    updatedAt: string;
}

/** Version list item: metadata only, the canvas is loaded per version on demand. */
export interface WorkflowVersionSummary {
  id: string;
  workflowId: string;
  version: number;
  /** The draft revision that was published. */
  draftRevision: number;
  createdAt: string;
}

export interface WorkflowVersionDetail extends WorkflowVersionSummary {
  canvas: WorkflowCanvas;
}

/** GET /workflows/:id only: list items do not carry version information. */
export interface WorkflowDetail extends Workflow {
  /** Highest published version, or null if the workflow was never published (it cannot run). */
  latestVersion: WorkflowVersionSummary | null;
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

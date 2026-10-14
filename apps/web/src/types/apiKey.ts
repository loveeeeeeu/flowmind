/** List item: the server never returns the key itself, only its public prefix. */
export interface WorkflowApiKey {
  id: string;
  workflowId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Only the create response carries the raw key. Keep it in component state, never storage. */
export interface CreatedWorkflowApiKey extends WorkflowApiKey {
  key: string;
}

import type { WorkflowDetail } from '../../types/workflow';

/**
 * Whether the saved draft differs from the latest published version. Revisions only, never a
 * canvas comparison: every save bumps draftRevision and each version records the one it published.
 * Unsaved local edits (isDirty) are a separate concern and deliberately not part of this.
 */
export function hasUnpublishedChanges(
  workflow: Pick<WorkflowDetail, 'draftCanvas' | 'draftRevision' | 'latestVersion'>,
) {
  if (!workflow.latestVersion) {
    // Never published: there is something to publish only once a draft has been saved.
    return workflow.draftCanvas !== null;
  }

  return workflow.draftRevision > workflow.latestVersion.draftRevision;
}

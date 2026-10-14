import type { WorkflowCanvas } from '@flowmind/workflow-core';

export const WORKFLOW_VERSION_MISSING = 'WORKFLOW_VERSION_MISSING';
export const DRAFT_SNAPSHOT_MISSING = 'DRAFT_SNAPSHOT_MISSING';
export const UNSUPPORTED_RUN_SOURCE = 'UNSUPPORTED_RUN_SOURCE';

/** The fields of a run that decide what it executes. Workflow.draftCanvas is deliberately absent. */
export interface RunCanvasSource {
  source: string;
  workflowVersion: { canvas: unknown } | null;
  draftSnapshot: unknown;
}

function runError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

/**
 * The only place the worker picks a canvas. Both sources are immutable snapshots taken when the
 * run was created, so edits or publishes while the run is queued never change what it executes.
 * A missing snapshot fails the run explicitly; falling back to the live draft would execute
 * something nobody asked for.
 */
export function resolveRunCanvas(run: RunCanvasSource): WorkflowCanvas {
  switch (run.source) {
    case 'PUBLISHED':
      if (!run.workflowVersion) {
        // Legacy runs from before versioning end up here.
        throw runError(WORKFLOW_VERSION_MISSING, 'Published run has no workflow version');
      }
      return run.workflowVersion.canvas as WorkflowCanvas;

    case 'DRAFT':
      if (!run.draftSnapshot) {
        throw runError(DRAFT_SNAPSHOT_MISSING, 'Draft run has no snapshot');
      }
      return run.draftSnapshot as WorkflowCanvas;

    default:
      throw runError(UNSUPPORTED_RUN_SOURCE, `Unsupported run source: ${run.source}`);
  }
}

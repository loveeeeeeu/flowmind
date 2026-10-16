import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkflowRun,
  createWorkflowTestRun,
  getWorkflowRun,
  getWorkflowRuns,
} from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import type { WorkflowRunSummary } from '../../types/run';
import type { WorkflowCanvas } from '../types/workflowCanvas';
import { isTerminalRunStatus, isUnfinishedRun } from './runUtils';

const RUN_POLL_INTERVAL_MS = 1000;

function useRunDetail(projectId: string, runId: string | null) {
  return useQuery({
    queryKey: queryKeys.runs.detail(projectId, runId ?? ''),
    queryFn: () => getWorkflowRun(projectId, runId as string),
    enabled: runId !== null,
    refetchInterval: (query) =>
      isTerminalRunStatus(query.state.data?.status) ? false : RUN_POLL_INTERVAL_MS,
  });
}

/**
 * Lives in the editor rather than the panel: the canvas overlay and the panel must show the
 * same "viewed" run. Server state stays in TanStack Query; only ids and UI flags are local.
 */
export function useExecutionState(projectId: string, workflowId: string) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: queryKeys.runs.workflowHistory(projectId, workflowId),
    queryFn: () => getWorkflowRuns(projectId, workflowId),
  });
  const history = historyQuery.data;

  // After a page refresh there is no activeRunId, so keep following the newest unfinished run.
  const trackedRunId =
    activeRunId ?? history?.find(isUnfinishedRun)?.id ?? history?.[0]?.id ?? null;
  const viewedRunId = selectedRunId ?? trackedRunId;

  const trackedRunQuery = useRunDetail(projectId, trackedRunId);
  // Same query key as trackedRunQuery when both point at one run, so it is fetched only once.
  const viewedRunQuery = useRunDetail(projectId, viewedRunId);

  // Polling the detail finishes before the history list knows; refresh the summary once.
  const historyIsBehind = [trackedRunQuery.data, viewedRunQuery.data].some((run) => {
    if (!run || !isTerminalRunStatus(run.status)) {
      return false;
    }

    const summary = history?.find((item) => item.id === run.id);

    return summary !== undefined && summary.status !== run.status;
  });

  useEffect(() => {
    if (historyIsBehind) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.runs.workflowHistory(projectId, workflowId),
      });
    }
  }, [historyIsBehind, projectId, queryClient, workflowId]);

  // Draft tests and published runs share one history, trace and polling; only the source differs.
  async function followRun(run: WorkflowRunSummary) {
    setActiveRunId(run.id);
    setSelectedRunId(null);
    setIsOpen(true);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.runs.workflowHistory(projectId, workflowId),
    });
  }

  const runMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createWorkflowRun(projectId, workflowId, input),
    onSuccess: followRun,
  });

  const testRunMutation = useMutation({
    mutationFn: ({ input, canvas }: { input: Record<string, unknown>; canvas: WorkflowCanvas }) =>
      createWorkflowTestRun(projectId, workflowId, input, canvas),
    onSuccess: followRun,
  });

  return {
    projectId,
    isOpen,
    setIsOpen,
    historyQuery,
    trackedRun: trackedRunQuery.data,
    viewedRunId,
    viewedRunQuery,
    selectRun: setSelectedRunId,
    runMutation,
    testRunMutation,
  };
}

export type ExecutionState = ReturnType<typeof useExecutionState>;

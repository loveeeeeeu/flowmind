import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkflowRun, getWorkflowRun, getWorkflowRuns } from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import { isTerminalRunStatus, isUnfinishedRun } from './runUtils';

const RUN_POLL_INTERVAL_MS = 1000;

function useRunDetail(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.runs.detail(runId ?? ''),
    queryFn: () => getWorkflowRun(runId as string),
    enabled: runId !== null,
    refetchInterval: (query) =>
      isTerminalRunStatus(query.state.data?.status) ? false : RUN_POLL_INTERVAL_MS,
  });
}

/**
 * Lives in the editor rather than the panel: the canvas overlay and the panel must show the
 * same "viewed" run. Server state stays in TanStack Query; only ids and UI flags are local.
 */
export function useExecutionState(workflowId: string) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: queryKeys.runs.workflowHistory(workflowId),
    queryFn: () => getWorkflowRuns(workflowId),
  });
  const history = historyQuery.data;

  // After a page refresh there is no activeRunId, so keep following the newest unfinished run.
  const trackedRunId =
    activeRunId ?? history?.find(isUnfinishedRun)?.id ?? history?.[0]?.id ?? null;
  const viewedRunId = selectedRunId ?? trackedRunId;

  const trackedRunQuery = useRunDetail(trackedRunId);
  // Same query key as trackedRunQuery when both point at one run, so it is fetched only once.
  const viewedRunQuery = useRunDetail(viewedRunId);

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
        queryKey: queryKeys.runs.workflowHistory(workflowId),
      });
    }
  }, [historyIsBehind, queryClient, workflowId]);

  const runMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createWorkflowRun(workflowId, input),
    onSuccess: async (run) => {
      setActiveRunId(run.id);
      setSelectedRunId(null);
      setIsOpen(true);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.runs.workflowHistory(workflowId),
      });
    },
  });

  return {
    isOpen,
    setIsOpen,
    historyQuery,
    trackedRun: trackedRunQuery.data,
    viewedRunId,
    viewedRunQuery,
    selectRun: setSelectedRunId,
    runMutation,
  };
}

export type ExecutionState = ReturnType<typeof useExecutionState>;

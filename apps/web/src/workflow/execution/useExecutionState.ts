import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RunEvent } from '@flowmind/shared';
import {
  createWorkflowRun,
  createWorkflowTestRun,
  getWorkflowRun,
  getWorkflowRuns,
} from '../../api/runs';
import { queryKeys } from '../../api/queryKeys';
import type { WorkflowRunDetail, WorkflowRunSummary } from '../../types/run';
import type { WorkflowCanvas } from '../types/workflowCanvas';
import {
  isTerminalRunStatus,
  isUnfinishedRun,
  shouldApplyNodeRunStatus,
  shouldApplyRunStatus,
} from './runUtils';
import { useRunEventStream } from './useRunEventStream';

const RUN_POLL_INTERVAL_MS = 2000;

function applyNodeStatusEvent(old: WorkflowRunDetail, event: Extract<RunEvent, { type: 'NODE_STATUS_CHANGED' }>) {
  const index = old.nodeRuns.findIndex((nodeRun) => nodeRun.id === event.nodeRunId);
  const errorCode = event.error?.code ?? null;
  const errorMessage = event.error?.message ?? null;

  if (index === -1) {
    return {
      ...old,
      nodeRuns: [
        ...old.nodeRuns,
        {
          id: event.nodeRunId,
          workflowRunId: old.id,
          nodeId: event.nodeId,
          nodeType: event.nodeType,
          status: event.status,
          sequence: event.sequence,
          iteration: null,
          attempt: event.attempt,
          input: null,
          output: null,
          errorCode,
          errorMessage,
          startedAt: event.startedAt,
          finishedAt: event.finishedAt,
          createdAt: event.timestamp,
        },
      ],
    };
  }

  const current = old.nodeRuns[index];

  if (!shouldApplyNodeRunStatus(current.status, event.status)) {
    return old;
  }

  const nodeRuns = [...old.nodeRuns];
  nodeRuns[index] = {
    ...current,
    nodeId: event.nodeId,
    nodeType: event.nodeType,
    status: event.status,
    sequence: event.sequence,
    attempt: event.attempt,
    errorCode,
    errorMessage,
    startedAt: event.startedAt ?? current.startedAt,
    finishedAt: event.finishedAt ?? current.finishedAt,
  };

  return { ...old, nodeRuns };
}

function useRunDetail(projectId: string, runId: string | null, pollingEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.runs.detail(projectId, runId ?? ''),
    queryFn: () => getWorkflowRun(projectId, runId as string),
    enabled: runId !== null,
    refetchInterval: (query) => {
      if (isTerminalRunStatus(query.state.data?.status)) {
        return false;
      }

      return pollingEnabled ? RUN_POLL_INTERVAL_MS : false;
    },
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

  const handleRunEvent = useCallback(
    (event: RunEvent) => {
      queryClient.setQueryData<WorkflowRunDetail>(queryKeys.runs.detail(projectId, event.runId), (old) => {
        if (!old) {
          return old;
        }

        if (event.type === 'NODE_STATUS_CHANGED') {
          return applyNodeStatusEvent(old, event);
        }

        if (event.type !== 'RUN_SNAPSHOT' && event.type !== 'RUN_STATUS_CHANGED') {
          return old;
        }

        if (!shouldApplyRunStatus(old.status, event.status)) {
          return old;
        }

        const common = {
          status: event.status,
          errorCode: event.error?.code ?? null,
          errorMessage: event.error?.message ?? null,
        };
        return event.type === 'RUN_SNAPSHOT'
          ? { ...old, ...common, output: event.output }
          : { ...old, ...common };
      });
    },
    [projectId, queryClient],
  );

  // SSE is an incremental UI signal; the existing query polling remains the consistency fallback.
  const stream = useRunEventStream({
    projectId,
    runId: trackedRunId,
    enabled: isOpen && trackedRunId !== null,
    onEvent: handleRunEvent,
  });

  const trackedRunQuery = useRunDetail(projectId, trackedRunId, stream.pollingEnabled);
  // A separately viewed unfinished historical run has no dedicated stream, so it keeps fallback polling.
  const viewedRunQuery = useRunDetail(
    projectId,
    viewedRunId,
    selectedRunId === null ? stream.pollingEnabled : true,
  );

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
    stream,
    selectRun: setSelectedRunId,
    runMutation,
    testRunMutation,
  };
}

export type ExecutionState = ReturnType<typeof useExecutionState>;

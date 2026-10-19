import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RunEvent } from '@flowmind/shared';
import { clearAccessToken, getAccessToken } from '../../auth/token';
import { subscribeToRunEvents, type FatalRunStreamError } from '../../api/runEvents';
import { queryKeys } from '../../api/queryKeys';
import { getWorkflowRun } from '../../api/runs';
import type { WorkflowRunDetail } from '../../types/run';
import { RecentEventIds } from './recentEventIds';

export type RunStreamState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

interface UseRunEventStreamParams {
  projectId: string;
  runId: string | null;
  enabled: boolean;
  onEvent: (event: RunEvent) => void;
}

export function getRunConnectionLabel(state: RunStreamState) {
  switch (state) {
    case 'CONNECTED':
      return 'Live';
    case 'CONNECTING':
    case 'RECONNECTING':
      return 'Reconnecting…';
    default:
      return 'Polling';
  }
}

export function useRunEventStream({ projectId, runId, enabled, onEvent }: UseRunEventStreamParams) {
  const queryClient = useQueryClient();
  const streamKey = enabled && runId ? `${projectId}:${runId}` : null;
  const token = getAccessToken();
  const [connection, setConnection] = useState<{
    key: string;
    state: RunStreamState;
    fatalError: FatalRunStreamError | null;
  }>({ key: '', state: 'IDLE', fatalError: null });
  const recentEventIdsRef = useRef(new RecentEventIds());

  const state: RunStreamState = !streamKey
    ? 'IDLE'
    : !token
      ? 'DISCONNECTED'
      : connection.key === streamKey
        ? connection.state
        : 'CONNECTING';
  const fatalError = connection.key === streamKey ? connection.fatalError : null;

  const reconcile = useCallback(async () => {
    if (!runId) {
      return;
    }

    try {
      await queryClient.fetchQuery<WorkflowRunDetail>({
        queryKey: queryKeys.runs.detail(projectId, runId),
        queryFn: () => getWorkflowRun(projectId, runId),
      });
    } catch {
      // The mounted Run query exposes this error; stream reconnect/polling can still recover later.
    }
  }, [projectId, queryClient, runId]);

  useEffect(() => {
    if (!enabled || !runId) {
      return;
    }

    if (!token) {
      return;
    }

    const controller = new AbortController();
    void subscribeToRunEvents({
      projectId,
      runId,
      token,
      signal: controller.signal,
      onOpen: () => {
        setConnection({ key: streamKey!, state: 'CONNECTED', fatalError: null });
        // An SSE connection can miss Pub/Sub events while it is being established.
        void reconcile();
      },
      onRetrying: () => setConnection({ key: streamKey!, state: 'RECONNECTING', fatalError: null }),
      onFatalError: (error) => {
        setConnection({ key: streamKey!, state: 'DISCONNECTED', fatalError: error });
        if (error.status === 401) {
          clearAccessToken();
          if (window.location.pathname !== '/login') {
            window.location.assign('/login');
          }
        }
      },
      onEvent: (event) => {
        if (recentEventIdsRef.current.has(event.eventId)) {
          return;
        }

        recentEventIdsRef.current.add(event.eventId);
        onEvent(event);
      },
    }).catch(() => {
      // Fatal errors are handled above; aborting on component cleanup is expected.
    });

    return () => {
      controller.abort();
    };
  }, [enabled, onEvent, projectId, reconcile, runId, streamKey, token]);

  useEffect(() => {
    if (!enabled || !runId || fatalError || !token) {
      return;
    }

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void reconcile();
      }
    };
    const handleOnline = () => void reconcile();

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, fatalError, reconcile, runId, token]);

  return {
    state,
    connected: state === 'CONNECTED',
    // Authentication and access failures should not turn into an endless unauthorised polling loop.
    pollingEnabled: state !== 'CONNECTED' && fatalError === null && token !== null,
    fatalError,
  };
}

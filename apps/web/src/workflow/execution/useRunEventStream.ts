import { useEffect } from 'react';
import type { RunEvent } from '@flowmind/shared';
import { subscribeToRunEvents } from '../../api/runEvents';

interface UseRunEventStreamParams {
  projectId: string;
  runId: string | null;
  enabled: boolean;
  onEvent: (event: RunEvent) => void;
}

export function useRunEventStream({ projectId, runId, enabled, onEvent }: UseRunEventStreamParams) {
  useEffect(() => {
    if (!enabled || !runId) {
      return;
    }

    const controller = new AbortController();
    void subscribeToRunEvents({
      projectId,
      runId,
      signal: controller.signal,
      onEvent,
      onError: (error) => {
        if (!controller.signal.aborted) {
          console.warn('Run event stream disconnected; polling remains active', error);
        }
      },
    }).catch(() => {
      // onError already reports non-abort failures. No reconnect policy is introduced in Lesson 1.
    });

    return () => controller.abort();
  }, [enabled, onEvent, projectId, runId]);
}

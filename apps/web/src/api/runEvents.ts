import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { RunEvent } from '@flowmind/shared';
import { getAccessToken } from '../auth/token';
import { API_BASE_URL } from './client';

interface SubscribeToRunEventsParams {
  projectId: string;
  runId: string;
  signal: AbortSignal;
  onEvent: (event: RunEvent) => void;
  onError?: (error: unknown) => void;
}

/** EventSource cannot send the JWT Authorization header, so management SSE uses fetch instead. */
export async function subscribeToRunEvents(params: SubscribeToRunEventsParams) {
  const token = getAccessToken();
  if (!token) {
    return;
  }

  await fetchEventSource(
    `${API_BASE_URL}/projects/${params.projectId}/runs/${params.runId}/events`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: params.signal,
      onmessage(message) {
        try {
          params.onEvent(JSON.parse(message.data) as RunEvent);
        } catch (error) {
          params.onError?.(error);
        }
      },
      onerror(error) {
        params.onError?.(error);
        throw error;
      },
    },
  );
}

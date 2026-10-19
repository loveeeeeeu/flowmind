import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { RunEvent } from '@flowmind/shared';
import { API_BASE_URL } from './client';

export class RetryableRunStreamError extends Error {}

export class FatalRunStreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Fatal SSE error: ${status}`);
    this.name = 'FatalRunStreamError';
    this.status = status;
  }
}

interface SubscribeToRunEventsParams {
  projectId: string;
  runId: string;
  token: string;
  signal: AbortSignal;
  onOpen?: () => void;
  onEvent: (event: RunEvent) => void;
  onRetrying?: (error: unknown) => void;
  onClosed?: () => void;
  onFatalError?: (error: FatalRunStreamError) => void;
}

/** EventSource cannot send the JWT Authorization header, so management SSE uses fetch instead. */
export async function subscribeToRunEvents(params: SubscribeToRunEventsParams) {
  await fetchEventSource(
    `${API_BASE_URL}/projects/${params.projectId}/runs/${params.runId}/events`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
      signal: params.signal,
      async onopen(response) {
        const isSse = response.headers.get('content-type')?.includes('text/event-stream');
        if (response.ok && isSse) {
          params.onOpen?.();
          return;
        }

        if ([401, 403, 404].includes(response.status)) {
          throw new FatalRunStreamError(response.status);
        }

        throw new RetryableRunStreamError(`Unexpected SSE response: ${response.status}`);
      },
      onmessage(message) {
        if (message.event === 'heartbeat') {
          return;
        }

        try {
          params.onEvent(JSON.parse(message.data) as RunEvent);
        } catch {
          // A malformed notification must not tear down an otherwise healthy stream.
        }
      },
      onclose() {
        if (params.signal.aborted) {
          return;
        }

        params.onClosed?.();
        throw new RetryableRunStreamError('SSE connection closed');
      },
      onerror(error) {
        if (error instanceof FatalRunStreamError) {
          params.onFatalError?.(error);
          throw error;
        }

        if (!params.signal.aborted) {
          params.onRetrying?.(error);
        }
        // Returning lets fetch-event-source use its built-in reconnect behaviour.
      },
    },
  );
}

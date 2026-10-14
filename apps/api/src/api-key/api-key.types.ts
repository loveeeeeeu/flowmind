import type { Request } from 'express';

/** What the guard attaches to the request: identifiers only, never the raw key. */
export interface AuthenticatedApiKey {
  id: string;
  workflowId: string;
}

export type ApiKeyRequest = Request & { apiKey?: AuthenticatedApiKey };

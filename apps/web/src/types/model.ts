import type { CredentialProvider } from './credential';

export type ModelType = 'CHAT' | 'EMBEDDING';

/** A model callable through one credential. credentialId and modelName never change. */
export interface Model {
  id: string;
  credentialId: string;
  /** Display name inside FlowMind. */
  name: string;
  /** Exact identifier sent to the provider API. */
  modelName: string;
  type: ModelType;
  contextWindow: number | null;
  supportsTemperature: boolean;
  embeddingDimensions: number | null;
  /** false: hidden from new node configuration; published versions using it still run. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /models/available: enabled models whose credential is not revoked. */
export interface AvailableModel {
  id: string;
  name: string;
  modelName: string;
  type: ModelType;
  contextWindow: number | null;
  supportsTemperature: boolean;
  embeddingDimensions: number | null;
  credential: {
    id: string;
    name: string;
    provider: CredentialProvider;
  };
}

export interface CreateModelInput {
  name: string;
  modelName: string;
  contextWindow?: number;
  supportsTemperature?: boolean;
  type?: ModelType;
  embeddingDimensions?: number;
}

/** Metadata only. */
export interface UpdateModelInput {
  name?: string;
  contextWindow?: number | null;
  supportsTemperature?: boolean;
  enabled?: boolean;
}

import { createContext } from 'react';
import type { AvailableModel } from '../../types/model';
import type { LlmNodeData } from '../types/workflowCanvas';

/** "OpenAI Production / GPT-5": model display names alone can repeat across credentials. */
export function getModelLabel(model: AvailableModel) {
  return `${model.credential.name} / ${model.name}`;
}

/** Saved before Model Center: provider + model strings, no modelId. */
export function isLegacyLlmData(data: Partial<LlmNodeData>) {
  return !data.modelId && (typeof data.provider === 'string' || typeof data.model === 'string');
}

/** Picking a model also drops the legacy fields for real instead of leaving `provider: undefined`. */
export function withSelectedModel(data: LlmNodeData, modelId: string): LlmNodeData {
  const next: LlmNodeData = { ...data, modelId };
  delete next.provider;
  delete next.model;

  return next;
}

/**
 * Available models by id, provided by the editor so canvas nodes can show their model without
 * each fetching it. undefined while loading. Render-only: nothing from here is saved.
 */
export const AvailableModelsContext = createContext<ReadonlyMap<string, AvailableModel> | undefined>(
  undefined,
);

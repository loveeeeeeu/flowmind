import type { ProviderRegistry } from '@flowmind/shared';
import type { RuntimeModelResolver } from '../llm/runtime-model-resolver.js';
import { EmbeddingService } from './embedding.service.js';

const model = {
  modelId: 'embed-1', modelName: 'text-embedding', provider: 'OPENAI' as const,
  baseUrl: null, apiKey: 'secret', type: 'EMBEDDING' as const,
  embeddingDimensions: 2, supportsTemperature: false,
};

function setup(embeddings: number[][]) {
  const resolveEmbeddingModel = vi.fn(async () => model);
  const embed = vi.fn(async () => ({ embeddings, dimensions: embeddings[0]?.length ?? 0 }));
  const getEmbeddingProvider = vi.fn(() => ({ embed }));
  const service = new EmbeddingService(
    { resolveEmbeddingModel } as unknown as RuntimeModelResolver,
    { getEmbeddingProvider } as unknown as ProviderRegistry,
  );
  return { service, resolveEmbeddingModel, embed };
}

describe('EmbeddingService', () => {
  it('returns immediately for an empty input without resolving a model', async () => {
    const { service, resolveEmbeddingModel } = setup([]);
    await expect(service.embed('embed-1', [])).resolves.toEqual({ embeddings: [], dimensions: 0 });
    expect(resolveEmbeddingModel).not.toHaveBeenCalled();
  });

  it('validates the output count and configured dimensions before returning vectors', async () => {
    const { service, embed } = setup([[0.1, 0.2], [0.3, 0.4]]);
    await expect(service.embed('embed-1', ['a', 'b'])).resolves.toEqual({
      embeddings: [[0.1, 0.2], [0.3, 0.4]], dimensions: 2,
    });
    expect(embed).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-embedding', texts: ['a', 'b'] }));

    await expect(setup([[0.1]]).service.embed('embed-1', ['a'])).rejects.toMatchObject({
      code: 'EMBEDDING_DIMENSION_MISMATCH', retryable: false,
    });
    await expect(setup([[0.1, 0.2]]).service.embed('embed-1', ['a', 'b'])).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE', retryable: false,
    });
  });
});

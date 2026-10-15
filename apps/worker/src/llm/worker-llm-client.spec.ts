import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProviderRegistry } from './provider-registry.js';
import type { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import { WorkerLlmClient } from './worker-llm-client.js';

interface ModelRow {
  modelName: string;
  supportsTemperature: boolean;
  credential: { provider: string; revokedAt: Date | null };
}

const deepseekModel: ModelRow = {
  modelName: 'deepseek-chat',
  supportsTemperature: true,
  credential: { provider: 'DEEPSEEK', revokedAt: null },
};

function setup(model: ModelRow | null) {
  const config = { id: 'deepseek', baseUrl: 'https://example.com', apiKey: 'test-key' };
  const prisma = { model: { findUnique: vi.fn(async () => model) } };
  const registry = { get: vi.fn(() => config) };
  const generate = vi.fn(async () => ({ text: 'hi', usage: { totalTokens: 3 }, raw: {} }));
  const client = new WorkerLlmClient(
    prisma as unknown as PrismaService,
    registry as unknown as ProviderRegistry,
    { generate } as unknown as OpenAICompatibleProvider,
  );

  return { client, prisma, registry, generate, config };
}

const request = { modelId: 'model-1', prompt: 'Hello', temperature: 0.2 };

describe('WorkerLlmClient', () => {
  it('resolves modelId to the model name and its provider, then calls the adapter', async () => {
    const { client, prisma, registry, generate, config } = setup(deepseekModel);

    const result = await client.generate(request);

    expect(prisma.model.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'model-1' } }),
    );
    expect(registry.get).toHaveBeenCalledWith('deepseek');
    expect(generate).toHaveBeenCalledWith(config, {
      model: 'deepseek-chat',
      prompt: 'Hello',
      systemPrompt: undefined,
      temperature: 0.2,
    });
    expect(result).toEqual({ text: 'hi', usage: { totalTokens: 3 } });
  });

  it.each([
    ['OPENAI', 'openai'],
    ['OPENAI_COMPATIBLE', 'custom'],
  ])('maps %s credentials to the %s env provider', async (provider, registryId) => {
    const { client, registry } = setup({ ...deepseekModel, credential: { provider, revokedAt: null } });

    await client.generate(request);

    expect(registry.get).toHaveBeenCalledWith(registryId);
  });

  it('drops temperature for models that do not support it', async () => {
    const { client, generate } = setup({ ...deepseekModel, supportsTemperature: false });

    await client.generate(request);

    expect(generate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ temperature: undefined }));
  });

  it('fails with MODEL_NOT_FOUND, not retryable, for an unknown model', async () => {
    const { client, generate } = setup(null);

    await expect(client.generate(request)).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
      retryable: false,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('fails with CREDENTIAL_REVOKED when the credential is revoked', async () => {
    const { client, generate } = setup({
      ...deepseekModel,
      credential: { provider: 'DEEPSEEK', revokedAt: new Date() },
    });

    await expect(client.generate(request)).rejects.toMatchObject({
      code: 'CREDENTIAL_REVOKED',
      retryable: false,
    });
    expect(generate).not.toHaveBeenCalled();
  });
});

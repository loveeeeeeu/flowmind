import { type LlmProvider, LlmProviderError, ProviderRegistry } from '@flowmind/shared';
import type { ResolvedModelConfig, RuntimeModelResolver } from './runtime-model-resolver.js';
import { WorkerLlmClient } from './worker-llm-client.js';

const deepseek: ResolvedModelConfig = {
  modelId: 'model-1',
  modelName: 'deepseek-chat',
  provider: 'DEEPSEEK',
  baseUrl: null,
  apiKey: 'sk-decrypted',
  supportsTemperature: true,
};

function setup(model: ResolvedModelConfig | Error) {
  const resolve = vi.fn(async () => {
    if (model instanceof Error) {
      throw model;
    }
    return model;
  });
  const generate = vi.fn(async () => ({ text: 'hi', usage: { totalTokens: 3 }, raw: {} }));
  const registry = new ProviderRegistry({ generate } as unknown as LlmProvider);
  const client = new WorkerLlmClient({ resolve } as unknown as RuntimeModelResolver, registry);

  return { client, resolve, generate };
}

const request = { modelId: 'model-1', prompt: 'Hello', systemPrompt: 'Be brief', temperature: 0.2 };

describe('WorkerLlmClient', () => {
  it('resolves the modelId and passes the resolved call config to the provider adapter', async () => {
    const { client, resolve, generate } = setup(deepseek);

    const result = await client.generate(request);

    expect(resolve).toHaveBeenCalledWith('model-1');
    expect(generate).toHaveBeenCalledWith({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-decrypted',
      model: 'deepseek-chat',
      prompt: 'Hello',
      systemPrompt: 'Be brief',
      temperature: 0.2,
    });
    expect(result).toEqual({ text: 'hi', usage: { totalTokens: 3 } });
  });

  it.each([
    ['OPENAI', null, 'https://api.openai.com/v1'],
    ['DEEPSEEK', null, 'https://api.deepseek.com'],
    ['OPENAI', 'https://proxy.example.com/v1', 'https://proxy.example.com/v1'],
    ['OPENAI_COMPATIBLE', 'http://localhost:8000/v1', 'http://localhost:8000/v1'],
  ] as const)('%s with baseUrl %s calls %s', async (provider, baseUrl, expected) => {
    const { client, generate } = setup({ ...deepseek, provider, baseUrl });

    await client.generate(request);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: expected }));
  });

  it('fails with CREDENTIAL_BASE_URL_REQUIRED for an OpenAI-compatible credential without one', async () => {
    const { client, generate } = setup({ ...deepseek, provider: 'OPENAI_COMPATIBLE', baseUrl: null });

    await expect(client.generate(request)).rejects.toMatchObject({
      code: 'CREDENTIAL_BASE_URL_REQUIRED',
      retryable: false,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('drops temperature for models that do not support it', async () => {
    const { client, generate } = setup({ ...deepseek, supportsTemperature: false });

    await client.generate(request);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ temperature: undefined }));
  });

  it('does not call the provider when resolution fails', async () => {
    const revoked = Object.assign(new Error('revoked'), { code: 'CREDENTIAL_REVOKED', retryable: false });
    const { client, generate } = setup(revoked);

    await expect(client.generate(request)).rejects.toBe(revoked);
    expect(generate).not.toHaveBeenCalled();
  });

  it('passes provider errors through unchanged, keeping their retry semantics', async () => {
    const { client, generate } = setup(deepseek);
    const rateLimit = new LlmProviderError({ code: 'RATE_LIMIT', status: 429, retryable: true, message: 'Rate limit' });
    generate.mockRejectedValueOnce(rateLimit);

    await expect(client.generate(request)).rejects.toBe(rateLimit);
  });

  it('never returns the secret in its result', async () => {
    const { client } = setup(deepseek);

    const result = await client.generate(request);

    expect(JSON.stringify(result)).not.toContain('sk-decrypted');
  });
});

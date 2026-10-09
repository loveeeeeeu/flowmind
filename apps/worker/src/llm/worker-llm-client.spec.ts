import type { ProviderRegistry } from './provider-registry.js';
import type { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import { WorkerLlmClient } from './worker-llm-client.js';

describe('WorkerLlmClient', () => {
  it('resolves the provider config and forwards the prompt to the adapter', async () => {
    const config = { id: 'deepseek', baseUrl: 'https://example.com', apiKey: 'test-key' };
    const registry = { get: vi.fn(() => config) } as unknown as ProviderRegistry;
    const generate = vi.fn(async () => ({ text: 'hi', usage: { totalTokens: 3 }, raw: {} }));
    const client = new WorkerLlmClient(registry, { generate } as unknown as OpenAICompatibleProvider);

    const result = await client.generate({
      provider: 'deepseek',
      model: 'm',
      prompt: 'Hello',
      temperature: 0.2,
    });

    expect(registry.get).toHaveBeenCalledWith('deepseek');
    expect(generate).toHaveBeenCalledWith(config, { model: 'm', prompt: 'Hello', temperature: 0.2 });
    expect(result).toEqual({ text: 'hi', usage: { totalTokens: 3 } });
  });
});

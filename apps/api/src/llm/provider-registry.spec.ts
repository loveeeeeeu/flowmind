import type { ConfigService } from '@nestjs/config';
import { ProviderRegistry } from './provider-registry.js';

function createRegistry(values: Record<string, string>) {
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new ProviderRegistry(configService);
}

describe('ProviderRegistry', () => {
  it('throws when provider is not configured', () => {
    expect(() => createRegistry({}).get('openai')).toThrow(
      'LLM provider "openai" is not configured',
    );
  });

  it('registers deepseek with configured base url', () => {
    const registry = createRegistry({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://example.com',
    });

    expect(registry.get('deepseek')).toEqual({
      id: 'deepseek',
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
    });
  });

  it('falls back to default base url and hides api key in list', () => {
    const registry = createRegistry({ DEEPSEEK_API_KEY: 'test-key' });

    expect(registry.list()).toEqual([{ id: 'deepseek', baseUrl: 'https://api.deepseek.com' }]);
  });

  it('requires both key and base url for custom provider', () => {
    expect(createRegistry({ CUSTOM_LLM_API_KEY: 'k' }).has('custom')).toBe(false);
    expect(
      createRegistry({
        CUSTOM_LLM_API_KEY: 'k',
        CUSTOM_LLM_BASE_URL: 'http://localhost:8000/v1',
      }).has('custom'),
    ).toBe(true);
  });
});
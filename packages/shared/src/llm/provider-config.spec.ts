import { normalizeBaseUrl, resolveProviderBaseUrl } from './provider-config.js';
import { ProviderRegistry } from './provider-registry.js';
import type { LlmProvider } from './llm-provider.js';
import type { SupportedProvider } from './provider-config.js';

describe('resolveProviderBaseUrl', () => {
  it('prefers the credential base URL, without trailing slashes', () => {
    expect(resolveProviderBaseUrl({ provider: 'DEEPSEEK', baseUrl: 'https://proxy.example.com/v1//' })).toBe(
      'https://proxy.example.com/v1',
    );
  });

  it('falls back to the official endpoint for OpenAI and DeepSeek', () => {
    expect(resolveProviderBaseUrl({ provider: 'OPENAI', baseUrl: null })).toBe('https://api.openai.com/v1');
    expect(resolveProviderBaseUrl({ provider: 'DEEPSEEK' })).toBe('https://api.deepseek.com');
  });

  it('requires a base URL for OpenAI-compatible credentials', () => {
    expect(() => resolveProviderBaseUrl({ provider: 'OPENAI_COMPATIBLE', baseUrl: null })).toThrow(
      expect.objectContaining({ code: 'CREDENTIAL_BASE_URL_REQUIRED', retryable: false }),
    );
  });

  it('requires http or https protocol', () => {
    expect(() => resolveProviderBaseUrl({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'ftp://example.com' })).toThrow(
      expect.objectContaining({ code: 'NETWORK_ERROR', retryable: false }),
    );
    expect(() => resolveProviderBaseUrl({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'not-a-valid-url' })).toThrow(
      expect.objectContaining({ code: 'NETWORK_ERROR', retryable: false }),
    );
  });

  it('normalizeBaseUrl leaves a clean URL alone', () => {
    expect(normalizeBaseUrl('http://localhost:8000/v1')).toBe('http://localhost:8000/v1');
  });
});

describe('ProviderRegistry', () => {
  const adapter = { generate: vi.fn(), listModels: vi.fn(), testConnection: vi.fn() } as LlmProvider;
  const registry = new ProviderRegistry(adapter);

  it.each(['OPENAI', 'DEEPSEEK', 'OPENAI_COMPATIBLE'] as const)(
    'routes %s to the OpenAI-compatible adapter',
    (provider) => {
      expect(registry.get(provider)).toBe(adapter);
    },
  );

  it('fails with PROVIDER_NOT_SUPPORTED, not retryable, for an unknown provider', () => {
    expect(() => registry.get('ANTHROPIC' as SupportedProvider)).toThrow(
      expect.objectContaining({ code: 'PROVIDER_NOT_SUPPORTED', retryable: false }),
    );
  });
});

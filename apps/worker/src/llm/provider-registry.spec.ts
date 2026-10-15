import { ProviderRegistry, resolveBaseUrl } from './provider-registry.js';
import type { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import type { CredentialProvider } from '../generated/prisma/enums.js';

describe('ProviderRegistry', () => {
  const adapter = { generate: vi.fn() } as unknown as OpenAICompatibleProvider;
  const registry = new ProviderRegistry(adapter);

  it.each(['OPENAI', 'DEEPSEEK', 'OPENAI_COMPATIBLE'] as const)(
    'routes %s to the OpenAI-compatible adapter',
    (provider) => {
      expect(registry.get(provider)).toBe(adapter);
    },
  );

  it('fails with PROVIDER_NOT_SUPPORTED, not retryable, for an unknown provider', () => {
    expect(() => registry.get('ANTHROPIC' as CredentialProvider)).toThrow(
      expect.objectContaining({ code: 'PROVIDER_NOT_SUPPORTED', retryable: false }),
    );
  });
});

describe('resolveBaseUrl', () => {
  it('prefers the credential base URL', () => {
    expect(resolveBaseUrl('DEEPSEEK', 'https://proxy.example.com')).toBe('https://proxy.example.com');
  });

  it('falls back to the official endpoint for OpenAI and DeepSeek', () => {
    expect(resolveBaseUrl('OPENAI', null)).toBe('https://api.openai.com/v1');
    expect(resolveBaseUrl('DEEPSEEK', null)).toBe('https://api.deepseek.com');
  });

  it('requires a base URL for OpenAI-compatible credentials', () => {
    expect(() => resolveBaseUrl('OPENAI_COMPATIBLE', null)).toThrow(
      expect.objectContaining({ code: 'CREDENTIAL_BASE_URL_REQUIRED', retryable: false }),
    );
  });
});

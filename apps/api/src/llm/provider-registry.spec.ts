import { ProviderRegistry } from './provider-registry.js';

const ENV_NAMES = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'CUSTOM_LLM_API_KEY',
  'CUSTOM_LLM_BASE_URL',
];

describe('ProviderRegistry', () => {
  beforeEach(() => {
    for (const name of ENV_NAMES) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when provider is not configured', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.get('unknown')).toThrow('LLM provider "unknown" is not configured');
  });

  it('registers deepseek with default base url and hides api key in list', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');

    const registry = new ProviderRegistry();

    expect(registry.get('deepseek').apiKey).toBe('test-key');
    expect(registry.list()).toEqual([{ id: 'deepseek', baseUrl: 'https://api.deepseek.com' }]);
  });

  it('requires both key and base url for custom provider', () => {
    vi.stubEnv('CUSTOM_LLM_API_KEY', 'custom-key');

    expect(new ProviderRegistry().has('custom')).toBe(false);

    vi.stubEnv('CUSTOM_LLM_BASE_URL', 'http://localhost:8000/v1');

    expect(new ProviderRegistry().has('custom')).toBe(true);
  });
});
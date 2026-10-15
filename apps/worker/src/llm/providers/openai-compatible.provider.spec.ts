import type { ConfigService } from '@nestjs/config';
import { LlmProviderError } from '../errors/llm-provider.error.js';
import type { LlmProviderRequest } from './llm-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible.provider.js';

const input: LlmProviderRequest = {
  baseUrl: 'https://example.com/v1//',
  apiKey: 'test-key',
  model: 'test-model',
  prompt: 'hello',
};

function mockFetchResponse(body: string, status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));
}

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    const configService = { get: () => 1000 } as unknown as ConfigService;
    provider = new OpenAICompatibleProvider(configService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns text and usage on success', async () => {
    const fetchMock = mockFetchResponse(
      JSON.stringify({
        choices: [{ message: { content: 'Hi there' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
      200,
    );

    const result = await provider.generate(input);

    expect(result.text).toBe('Hi there');
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('sends temperature only when given', async () => {
    const fetchMock = mockFetchResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), 200);

    await provider.generate({ ...input, temperature: 0 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ temperature: 0 });
  });

  it.each([
    { status: 400, code: 'INVALID_REQUEST', retryable: false },
    { status: 401, code: 'AUTH_ERROR', retryable: false },
    { status: 402, code: 'INSUFFICIENT_BALANCE', retryable: false },
    { status: 429, code: 'RATE_LIMIT', retryable: true },
    { status: 500, code: 'PROVIDER_UNAVAILABLE', retryable: true },
    { status: 503, code: 'PROVIDER_UNAVAILABLE', retryable: true },
  ])('maps HTTP $status to $code', async ({ status, code, retryable }) => {
    mockFetchResponse('error body', status);

    await expect(provider.generate(input)).rejects.toMatchObject({
      status,
      code,
      retryable,
    });
  });

  it('maps timeout to TIMEOUT', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
      message: 'LLM provider timed out after 1000ms',
    });
  });

  it('maps connection failure to NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('maps empty choices to EMPTY_RESPONSE', async () => {
    mockFetchResponse(JSON.stringify({ choices: [] }), 200);

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
  });

  it('does not leak api key in error message', async () => {
    mockFetchResponse('unauthorized', 401);

    const error = await provider.generate(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).message).not.toContain('test-key');
  });
});
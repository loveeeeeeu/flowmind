import { LlmProviderError } from './llm-provider.error.js';
import type { LlmProviderRequest } from './llm-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible.provider.js';

const connection = { baseUrl: 'https://example.com/v1//', apiKey: 'test-key' };
const input: LlmProviderRequest = { ...connection, model: 'test-model', prompt: 'hello' };

function mockFetchResponse(body: string, status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));
}

function lastRequest(fetchMock: ReturnType<typeof mockFetchResponse>) {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe('OpenAICompatibleProvider.generate', () => {
  const provider = new OpenAICompatibleProvider({ generateTimeoutMs: 1000 });

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

    const [url, init] = lastRequest(fetchMock);
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

    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toMatchObject({ temperature: 0 });
  });

  it.each([
    { status: 400, code: 'INVALID_REQUEST', retryable: false },
    { status: 401, code: 'AUTH_ERROR', retryable: false },
    { status: 402, code: 'INSUFFICIENT_BALANCE', retryable: false },
    { status: 404, code: 'ENDPOINT_NOT_FOUND', retryable: false },
    { status: 429, code: 'RATE_LIMIT', retryable: true },
    { status: 500, code: 'PROVIDER_UNAVAILABLE', retryable: true },
    { status: 503, code: 'PROVIDER_UNAVAILABLE', retryable: true },
  ])('maps HTTP $status to $code', async ({ status, code, retryable }) => {
    mockFetchResponse('error body', status);

    await expect(provider.generate(input)).rejects.toMatchObject({ status, code, retryable });
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

    await expect(provider.generate(input)).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('maps empty choices to EMPTY_RESPONSE', async () => {
    mockFetchResponse(JSON.stringify({ choices: [] }), 200);

    await expect(provider.generate(input)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('does not leak the api key, even when the provider echoes it back', async () => {
    mockFetchResponse('{"error":"bad key test-key for model"}', 400);

    const error = await provider.generate(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).message).toContain('[redacted]');
    expect((error as LlmProviderError).message).not.toContain('test-key');
  });
});

describe('OpenAICompatibleProvider.embed', () => {
  const provider = new OpenAICompatibleProvider({ generateTimeoutMs: 1000 });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a batch to /embeddings and puts indexed vectors back in input order', async () => {
    const fetchMock = mockFetchResponse(JSON.stringify({
      data: [
        { index: 1, embedding: [0.3, 0.4] },
        { index: 0, embedding: [0.1, 0.2] },
      ],
      usage: { prompt_tokens: 4, total_tokens: 4 },
    }), 200);

    await expect(provider.embed({ ...connection, model: 'embed-model', texts: ['one', 'two'] })).resolves.toMatchObject({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      usage: { promptTokens: 4, totalTokens: 4 },
    });
    expect(lastRequest(fetchMock)[0]).toBe('https://example.com/v1/embeddings');
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      model: 'embed-model', input: ['one', 'two'],
    });
  });

  it('rejects missing, malformed, or non-finite vectors', async () => {
    mockFetchResponse(JSON.stringify({ data: [{ index: 0, embedding: [] }] }), 200);
    await expect(provider.embed({ ...connection, model: 'embed', texts: ['one'] })).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE', retryable: false,
    });
  });
});

describe('OpenAICompatibleProvider.listModels', () => {
  const provider = new OpenAICompatibleProvider({ connectionTimeoutMs: 500 });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs {baseUrl}/models with the key and returns the ids, deduplicated and sorted', async () => {
    const fetchMock = mockFetchResponse(
      JSON.stringify({
        object: 'list',
        data: [{ id: 'gpt-5-mini', owned_by: 'openai' }, { id: 'gpt-5' }, { id: 'gpt-5' }],
      }),
      200,
    );

    await expect(provider.listModels(connection)).resolves.toEqual([{ id: 'gpt-5' }, { id: 'gpt-5-mini' }]);

    const [url, init] = lastRequest(fetchMock);
    expect(url).toBe('https://example.com/v1/models');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('skips entries without a string id', async () => {
    mockFetchResponse(JSON.stringify({ data: [{ id: 'ok' }, { id: 3 }, null, 'text', { id: ' ' }] }), 200);

    await expect(provider.listModels(connection)).resolves.toEqual([{ id: 'ok' }]);
  });

  it.each([
    ['an object without data', '{"hello":"world"}'],
    ['data that is not a list', '{"data":{"id":"gpt-5"}}'],
    ['null', 'null'],
    ['HTML instead of JSON', '<html>login</html>'],
  ])('fails with INVALID_PROVIDER_RESPONSE for %s, not a TypeError', async (_name, body) => {
    mockFetchResponse(body, 200);

    await expect(provider.listModels(connection)).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
      retryable: false,
    });
  });

  it('uses the shorter connection timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'));

    await expect(provider.listModels(connection)).rejects.toMatchObject({
      code: 'TIMEOUT',
      message: 'LLM provider timed out after 500ms',
    });
  });

  it('testConnection resolves on a valid model list and fails like listModels otherwise', async () => {
    mockFetchResponse(JSON.stringify({ data: [] }), 200);
    await expect(provider.testConnection(connection)).resolves.toBeUndefined();

    vi.restoreAllMocks();
    mockFetchResponse('unauthorized', 401);
    await expect(provider.testConnection(connection)).rejects.toMatchObject({ code: 'AUTH_ERROR' });
  });
});

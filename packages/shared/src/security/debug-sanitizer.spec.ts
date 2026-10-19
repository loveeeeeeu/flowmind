import { sanitizeDebugMetadata, sanitizeDebugValue } from './debug-sanitizer.js';

describe('sanitizeDebugValue', () => {
  it('redacts sensitive keys recursively and keeps ordinary debug fields', () => {
    const value = {
      Authorization: 'Bearer aaa',
      authorization: 'Bearer bbb',
      AUTHORIZATION: 'Bearer ccc',
      apiKey: 'ddd',
      password: 'eee',
      cookie: 'fff',
      nested: { token: 'ggg' },
      modelId: 'deepseek-chat',
      modelName: 'DeepSeek Chat',
      provider: 'openai-compatible',
      statusCode: 200,
      temperature: 0.7,
    };

    expect(sanitizeDebugValue(value)).toEqual({
      Authorization: '[REDACTED]',
      authorization: '[REDACTED]',
      AUTHORIZATION: '[REDACTED]',
      apiKey: '[REDACTED]',
      password: '[REDACTED]',
      cookie: '[REDACTED]',
      nested: { token: '[REDACTED]' },
      modelId: 'deepseek-chat',
      modelName: 'DeepSeek Chat',
      provider: 'openai-compatible',
      statusCode: 200,
      temperature: 0.7,
    });
  });

  it('only returns object metadata and sanitises values inside arrays', () => {
    expect(sanitizeDebugMetadata(['not', 'metadata'])).toBeNull();
    expect(sanitizeDebugValue([{ 'x-api-key': 'secret' }, { statusCode: 201 }])).toEqual([
      { 'x-api-key': '[REDACTED]' },
      { statusCode: 201 },
    ]);
  });
});

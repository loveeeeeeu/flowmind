import type { BadRequestException } from '@nestjs/common';
import { ApiValidationPipe } from '../../common/api-validation.pipe.js';
import { CreateCredentialDto } from './create-credential.dto.js';
import { UpdateCredentialDto } from './update-credential.dto.js';

const pipe = new ApiValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const validate = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

async function rejection(metatype: new () => object, body: unknown) {
  const error = (await validate(metatype, body).catch((e: unknown) => e)) as BadRequestException;
  return error.getResponse() as { code: string; message: string };
}

const base = { name: 'My Key', provider: 'OPENAI', secret: 'sk-1' };

describe('CreateCredentialDto', () => {
  it.each([
    'https://api.openai.com/v1',
    'http://localhost:8000/v1',
    'http://192.168.1.10:8000/v1',
  ])('accepts baseUrl %s', async (baseUrl) => {
    await expect(validate(CreateCredentialDto, { ...base, baseUrl })).resolves.toMatchObject({ baseUrl });
  });

  it('trims name and secret, and turns an emptied baseUrl into null', async () => {
    await expect(
      validate(CreateCredentialDto, { name: '  My Key ', provider: 'OPENAI', secret: ' sk-1\n', baseUrl: '  ' }),
    ).resolves.toEqual({ name: 'My Key', provider: 'OPENAI', secret: 'sk-1', baseUrl: null });
  });

  it.each([
    ['a baseUrl carrying credentials', { ...base, baseUrl: 'https://user:pass@api.example.com/v1' }],
    ['a non-http baseUrl', { ...base, baseUrl: 'ftp://files.example.com' }],
    ['a baseUrl without protocol', { ...base, baseUrl: 'api.example.com/v1' }],
    ['an unknown provider', { ...base, provider: 'ANTHROPIC' }],
    ['an empty secret', { ...base, secret: '   ' }],
    ['a missing secret', { name: 'My Key', provider: 'OPENAI' }],
    ['a secret under another name', { ...base, apiKey: 'sk-2' }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, body) => {
    expect(await rejection(CreateCredentialDto, body)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('never echoes the submitted secret in a validation error', async () => {
    const { message } = await rejection(CreateCredentialDto, { ...base, secret: 'x'.repeat(5000) });

    expect(message).not.toContain('xxxx');
  });
});

describe('UpdateCredentialDto', () => {
  it('accepts a partial update and an explicit null baseUrl', async () => {
    await expect(validate(UpdateCredentialDto, { baseUrl: null })).resolves.toEqual({ baseUrl: null });
    await expect(validate(UpdateCredentialDto, { secret: 'sk-new' })).resolves.toEqual({ secret: 'sk-new' });
  });

  it.each([
    ['changing the provider', { provider: 'DEEPSEEK' }],
    ['a null name', { name: null }],
    ['a null secret', { secret: null }],
    ['an empty secret', { secret: '' }],
  ])('rejects %s', async (_name, body) => {
    expect(await rejection(UpdateCredentialDto, body)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

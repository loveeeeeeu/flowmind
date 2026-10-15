import type { BadRequestException } from '@nestjs/common';
import { ApiValidationPipe } from '../../common/api-validation.pipe.js';
import { CreateModelDto } from './create-model.dto.js';
import { UpdateModelDto } from './update-model.dto.js';

const pipe = new ApiValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const validate = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

async function rejection(metatype: new () => object, body: unknown) {
  const error = (await validate(metatype, body).catch((e: unknown) => e)) as BadRequestException;
  return error.getResponse() as { code: string; message: string };
}

describe('CreateModelDto', () => {
  it('trims names and keeps optional capabilities', async () => {
    await expect(
      validate(CreateModelDto, {
        name: ' GPT-4.1 Mini ',
        modelName: ' gpt-4.1-mini\n',
        contextWindow: 128000,
        supportsTemperature: false,
      }),
    ).resolves.toEqual({
      name: 'GPT-4.1 Mini',
      modelName: 'gpt-4.1-mini',
      contextWindow: 128000,
      supportsTemperature: false,
    });
  });

  it.each([
    ['an empty modelName', { name: 'M', modelName: '  ' }],
    ['a missing name', { modelName: 'm' }],
    ['a zero contextWindow', { name: 'M', modelName: 'm', contextWindow: 0 }],
    ['a fractional contextWindow', { name: 'M', modelName: 'm', contextWindow: 1.5 }],
    ['a string supportsTemperature', { name: 'M', modelName: 'm', supportsTemperature: 'yes' }],
    ['a client-chosen type', { name: 'M', modelName: 'm', type: 'CHAT' }],
    ['a credentialId in the body', { name: 'M', modelName: 'm', credentialId: 'other' }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, body) => {
    expect(await rejection(CreateModelDto, body)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('UpdateModelDto', () => {
  it('accepts metadata and lets contextWindow be cleared', async () => {
    await expect(
      validate(UpdateModelDto, { name: 'Renamed', contextWindow: null, enabled: false }),
    ).resolves.toEqual({ name: 'Renamed', contextWindow: null, enabled: false });
  });

  it.each([
    ['modelName', { modelName: 'gpt-5' }],
    ['credentialId', { credentialId: 'other' }],
    ['type', { type: 'CHAT' }],
  ])('rejects changing the immutable %s', async (field, body) => {
    const { code, message } = await rejection(UpdateModelDto, body);

    expect(code).toBe('VALIDATION_FAILED');
    expect(message).toContain(`property ${field} should not exist`);
  });

  it.each([
    ['a null name', { name: null }],
    ['a null enabled', { enabled: null }],
    ['a null supportsTemperature', { supportsTemperature: null }],
  ])('rejects %s', async (_name, body) => {
    expect(await rejection(UpdateModelDto, body)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

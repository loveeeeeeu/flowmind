import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import type { ConfigService } from '@nestjs/config';
import {
  CredentialCryptoService,
  CredentialDecryptionError,
  type EncryptedSecret,
} from './credential-crypto.service.js';

const masterKey = randomBytes(32).toString('base64');

function createService(key: string | undefined) {
  const config = { get: vi.fn(() => key) };
  return new CredentialCryptoService(config as unknown as ConfigService);
}

/** Flips one bit of a base64 field, keeping its length. */
function tamper(value: string) {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] ^= 0x01;
  return bytes.toString('base64');
}

describe('CredentialCryptoService', () => {
  const service = createService(masterKey);

  it('encrypts and decrypts a secret', () => {
    const secret = 'sk-test-secret';

    const encrypted = service.encrypt(secret);

    expect(encrypted.encryptedSecret).not.toContain(secret);
    expect(Buffer.from(encrypted.secretIv, 'base64')).toHaveLength(12);
    expect(Buffer.from(encrypted.secretAuthTag, 'base64')).toHaveLength(16);
    expect(service.decrypt(encrypted)).toBe(secret);
  });

  it('round-trips non-ASCII and long secrets', () => {
    const secret = `密钥-${'x'.repeat(4000)}-🔑`;

    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('uses a random IV: the same secret encrypts differently every time', () => {
    const a = service.encrypt('same-secret');
    const b = service.encrypt('same-secret');

    expect(a.secretIv).not.toBe(b.secretIv);
    expect(a.encryptedSecret).not.toBe(b.encryptedSecret);
    expect(service.decrypt(a)).toBe('same-secret');
    expect(service.decrypt(b)).toBe('same-secret');
  });

  it.each<[string, (e: EncryptedSecret) => EncryptedSecret]>([
    ['ciphertext', (e) => ({ ...e, encryptedSecret: tamper(e.encryptedSecret) })],
    ['auth tag', (e) => ({ ...e, secretAuthTag: tamper(e.secretAuthTag) })],
    ['IV', (e) => ({ ...e, secretIv: tamper(e.secretIv) })],
    ['truncated auth tag', (e) => ({ ...e, secretAuthTag: Buffer.from(e.secretAuthTag, 'base64').subarray(0, 4).toString('base64') })],
    ['swapped ciphertext', (e) => ({ ...e, encryptedSecret: service.encrypt('other').encryptedSecret })],
  ])('fails loudly when the %s was tampered with', (_name, mutate) => {
    const encrypted = mutate(service.encrypt('sk-test-secret'));

    expect(() => service.decrypt(encrypted)).toThrow(CredentialDecryptionError);
    expect(() => service.decrypt(encrypted)).toThrow(
      expect.objectContaining({ code: 'CREDENTIAL_DECRYPTION_ERROR', message: 'Credential decryption failed' }),
    );
  });

  it('cannot decrypt with another master key', () => {
    const encrypted = service.encrypt('sk-test-secret');
    const otherKey = createService(randomBytes(32).toString('base64'));

    expect(() => otherKey.decrypt(encrypted)).toThrow(CredentialDecryptionError);
  });

  it.each([
    ['missing', undefined, 'CREDENTIAL_ENCRYPTION_KEY is not configured'],
    ['a short password', '123456', 'must be 32 random bytes'],
    ['16 bytes', randomBytes(16).toString('base64'), 'must be 32 random bytes'],
    ['hex instead of base64', randomBytes(32).toString('hex'), 'must be 32 random bytes'],
  ])('refuses to start with a master key that is %s', (_name, key, message) => {
    expect(() => createService(key)).toThrow(message);
  });

  it('does not expose the master key when the service is logged or serialized', () => {
    const keyHex = Buffer.from(masterKey, 'base64').toString('hex');

    expect(JSON.stringify(service)).not.toContain(masterKey);
    expect(inspect(service, { depth: 5 })).not.toContain(masterKey);
    expect(inspect(service, { depth: 5 }).replace(/[^0-9a-f]/g, '')).not.toContain(keyHex);
  });
});

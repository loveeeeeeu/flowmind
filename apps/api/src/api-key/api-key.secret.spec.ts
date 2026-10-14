import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey, hashesMatch, parseApiKeyPrefix } from './api-key.secret.js';

describe('api key secret helpers', () => {
  it('generates fm_<16 hex>_<43 base64url> keys whose hash is SHA-256 of the whole key', () => {
    const { prefix, key, keyHash } = generateApiKey();

    expect(key).toMatch(/^fm_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/);
    expect(key.startsWith(`fm_${prefix}_`)).toBe(true);
    expect(keyHash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(keyHash).not.toContain(key);
  });

  it('generates a different prefix and secret every time', () => {
    const keys = Array.from({ length: 50 }, () => generateApiKey());

    expect(new Set(keys.map((k) => k.prefix)).size).toBe(50);
    expect(new Set(keys.map((k) => k.key)).size).toBe(50);
  });

  it('parses every generated key, including secrets that contain "_"', () => {
    for (let i = 0; i < 300; i += 1) {
      const { prefix, key } = generateApiKey();
      expect(parseApiKeyPrefix(key)).toBe(prefix);
    }

    const secretWithUnderscores = 'a_b-c'.padEnd(43, '_');
    expect(parseApiKeyPrefix(`fm_0123456789abcdef_${secretWithUnderscores}`)).toBe(
      '0123456789abcdef',
    );
  });

  it.each([
    ['empty', ''],
    ['wrong marker', `sk_0123456789abcdef_${'a'.repeat(43)}`],
    ['short prefix', `fm_0123_${'a'.repeat(43)}`],
    ['uppercase prefix', `fm_0123456789ABCDEF_${'a'.repeat(43)}`],
    ['short secret', 'fm_0123456789abcdef_abc'],
    ['fake', 'fm_fake_fake'],
  ])('rejects a malformed key (%s)', (_name, key) => {
    expect(parseApiKeyPrefix(key)).toBeNull();
  });

  it('compares hashes in constant time and handles different lengths', () => {
    const hash = hashApiKey('fm_x');

    expect(hashesMatch(hash, hashApiKey('fm_x'))).toBe(true);
    expect(hashesMatch(hash, hashApiKey('fm_y'))).toBe(false);
    expect(hashesMatch(hash, 'abcd')).toBe(false);
  });
});

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** 32 bytes in base64 are always 43 characters plus one "=". Node's decoder would silently skip junk. */
export const MASTER_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface EncryptedSecret {
  encryptedSecret: string;
  secretIv: string;
  secretAuthTag: string;
}

/** Wrong master key, tampered ciphertext / IV / auth tag: all look the same, on purpose. */
export class CredentialDecryptionError extends Error {
  readonly code = 'CREDENTIAL_DECRYPTION_ERROR';

  constructor(options?: ErrorOptions) {
    super('Credential decryption failed', options);
    this.name = 'CredentialDecryptionError';
  }
}

export function decodeMasterKey(encoded: string | undefined): Buffer {
  if (!encoded) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured');
  }

  if (!MASTER_KEY_PATTERN.test(encoded)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 random bytes encoded as base64');
  }

  return Buffer.from(encoded, 'base64');
}

/**
 * AES-256-GCM encryption of provider secrets, the only implementation (api encrypts, worker
 * decrypts). The master key is never stored in the database, and a #private field keeps it out
 * of console.log / JSON output. Changing the key makes every stored secret undecryptable.
 */
export class CredentialCrypto {
  readonly #key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error('Credential encryption key must be 32 bytes');
    }

    this.#key = key;
  }

  encrypt(plaintext: string): EncryptedSecret {
    // A GCM IV must never repeat under the same key; it does not need to be secret.
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv, { authTagLength: AUTH_TAG_BYTES });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      encryptedSecret: encrypted.toString('base64'),
      secretIv: iv.toString('base64'),
      secretAuthTag: cipher.getAuthTag().toString('base64'),
    };
  }

  /** Throws CredentialDecryptionError instead of ever returning a wrong or empty secret. */
  decrypt(payload: EncryptedSecret): string {
    try {
      const iv = Buffer.from(payload.secretIv, 'base64');
      const authTag = Buffer.from(payload.secretAuthTag, 'base64');

      // GCM accepts truncated tags, which weakens tamper detection; only full-length tags pass.
      if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
        throw new Error('Invalid IV or auth tag length');
      }

      const decipher = createDecipheriv(ALGORITHM, this.#key, iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(Buffer.from(payload.encryptedSecret, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new CredentialDecryptionError({ cause: error });
    }
  }
}

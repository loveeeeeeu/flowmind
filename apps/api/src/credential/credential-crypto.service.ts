import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialCrypto, decodeMasterKey, type EncryptedSecret } from '@flowmind/shared';

/** Nest wrapper: the AES-GCM logic itself lives in @flowmind/shared, shared with the worker. */
@Injectable()
export class CredentialCryptoService {
  readonly #crypto: CredentialCrypto;

  constructor(config: ConfigService) {
    this.#crypto = new CredentialCrypto(
      decodeMasterKey(config.get<string>('CREDENTIAL_ENCRYPTION_KEY')),
    );
  }

  encrypt(plaintext: string): EncryptedSecret {
    return this.#crypto.encrypt(plaintext);
  }

  decrypt(payload: EncryptedSecret): string {
    return this.#crypto.decrypt(payload);
  }
}

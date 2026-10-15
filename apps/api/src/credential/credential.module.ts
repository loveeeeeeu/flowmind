import { Module } from '@nestjs/common';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { CredentialController } from './credential.controller.js';
import { CredentialService } from './credential.service.js';

@Module({
  controllers: [CredentialController],
  providers: [CredentialService, CredentialCryptoService],
  exports: [CredentialService],
})
export class CredentialModule {}

import { Module } from '@nestjs/common';
import { OpenAICompatibleProvider, ProviderRegistry } from '@flowmind/shared';
import { CredentialConnectionService } from './credential-connection.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { CredentialController } from './credential.controller.js';
import { CredentialService } from './credential.service.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [ProjectModule],
  controllers: [CredentialController],
  providers: [
    CredentialService,
    CredentialCryptoService,
    CredentialConnectionService,
    // The api never generates text: only the 10 s connection timeout matters here.
    { provide: ProviderRegistry, useValue: new ProviderRegistry(new OpenAICompatibleProvider()) },
  ],
  // Knowledge query embedding reuses the same provider adapter registry; exporting it avoids
  // constructing a second registry with subtly different provider configuration.
  exports: [CredentialService, CredentialConnectionService, CredentialCryptoService, ProviderRegistry],
})
export class CredentialModule {}

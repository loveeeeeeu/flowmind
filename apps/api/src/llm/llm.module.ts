import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller.js';
import { ProviderRegistry } from './provider-registry.js';

@Module({
  controllers: [LlmController],
  providers: [ProviderRegistry],
  exports: [ProviderRegistry],
})
export class LlmModule {}

import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';
import { ProviderRegistry } from './provider-registry.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

@Module({
  controllers: [LlmController],
  providers: [ProviderRegistry, OpenAICompatibleProvider, LlmService],
  exports: [LlmService, ProviderRegistry],
})
export class LlmModule {}
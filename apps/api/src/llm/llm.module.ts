import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants.js';
import { LlmService } from './llm.service.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

@Module({
  providers: [
    OpenAICompatibleProvider,
    { provide: LLM_PROVIDER, useExisting: OpenAICompatibleProvider },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
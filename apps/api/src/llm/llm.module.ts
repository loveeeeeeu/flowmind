import { Module } from '@nestjs/common';
import { llmProvider } from './llm.provider.js';

@Module({
  providers: [llmProvider],
  exports: [llmProvider],
})
export class LlmModule {}
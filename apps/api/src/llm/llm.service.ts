import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants.js';
import type { LlmGenerateInput, LlmProvider } from './providers/llm-provider.js';

@Injectable()
export class LlmService {
  constructor(@Inject(LLM_PROVIDER) private readonly provider: LlmProvider) {}

  generate(input: LlmGenerateInput) {
    return this.provider.generate(input);
  }
}
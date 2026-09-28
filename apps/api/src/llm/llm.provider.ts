import type { Provider } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { DeepSeekProvider } from './providers/deepseek.provider.js';
export const llmProvider: Provider = {
  provide: LLM_PROVIDER,
  useClass: DeepSeekProvider,
};
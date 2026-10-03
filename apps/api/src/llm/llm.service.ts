import { Injectable } from '@nestjs/common';
import { ProviderRegistry } from './provider-registry.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';
import type { LlmGenerateInput } from './providers/llm-provider.js';

@Injectable()
export class LlmService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly adapter: OpenAICompatibleProvider,
  ) {}

  generate(providerId: string, input: LlmGenerateInput) {
    const config = this.registry.get(providerId);
    return this.adapter.generate(config, input);
  }
}
import { BadRequestException, Injectable } from '@nestjs/common';
import type { LlmProviderConfig } from './providers/llm-provider.js';

@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, LlmProviderConfig>();

  constructor() {
    this.registerFromEnv();
  }

  private registerFromEnv() {
    this.register(
      'deepseek',
      process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      process.env.DEEPSEEK_API_KEY,
    );
    this.register(
      'openai',
      process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      process.env.OPENAI_API_KEY,
    );
    this.register('custom', process.env.CUSTOM_LLM_BASE_URL, process.env.CUSTOM_LLM_API_KEY);
  }

  private register(id: string, baseUrl: string | undefined, apiKey: string | undefined) {
    if (!baseUrl || !apiKey) {
      return;
    }

    this.providers.set(id, { id, baseUrl, apiKey });
  }

  get(providerId: string): LlmProviderConfig {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new BadRequestException(`LLM provider "${providerId}" is not configured`);
    }

    return provider;
  }

  has(providerId: string) {
    return this.providers.has(providerId);
  }

  list() {
    return [...this.providers.values()].map(({ id, baseUrl }) => ({ id, baseUrl }));
  }
}
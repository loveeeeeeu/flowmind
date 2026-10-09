import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowExecutionError } from '@flowmind/workflow-core';
import type { LlmProviderConfig } from './providers/llm-provider.js';

@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, LlmProviderConfig>();

  constructor(private readonly configService: ConfigService) {
    this.register(
      'deepseek',
      this.read('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
      this.read('DEEPSEEK_API_KEY'),
    );
    this.register(
      'openai',
      this.read('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      this.read('OPENAI_API_KEY'),
    );
    this.register('custom', this.read('CUSTOM_LLM_BASE_URL'), this.read('CUSTOM_LLM_API_KEY'));
  }

  private read(key: string) {
    return this.configService.get<string>(key);
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
      throw new WorkflowExecutionError(`LLM provider "${providerId}" is not configured`);
    }

    return provider;
  }

  has(providerId: string) {
    return this.providers.has(providerId);
  }
}
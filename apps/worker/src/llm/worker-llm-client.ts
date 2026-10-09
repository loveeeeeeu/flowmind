import { Injectable } from '@nestjs/common';
import type { LlmClient, LlmGenerateRequest, LlmGenerateResponse } from '@flowmind/workflow-core';
import { ProviderRegistry } from './provider-registry.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

@Injectable()
export class WorkerLlmClient implements LlmClient {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly adapter: OpenAICompatibleProvider,
  ) {}

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const { provider, ...input } = request;
    const result = await this.adapter.generate(this.registry.get(provider), input);

    return { text: result.text, usage: result.usage };
  }
}

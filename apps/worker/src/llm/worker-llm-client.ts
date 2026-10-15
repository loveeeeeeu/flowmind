import { Injectable } from '@nestjs/common';
import { ProviderRegistry, resolveProviderBaseUrl } from '@flowmind/shared';
import type { LlmClient, LlmGenerateRequest, LlmGenerateResponse } from '@flowmind/workflow-core';
import { RuntimeModelResolver } from './runtime-model-resolver.js';

/**
 * The engine's LlmClient port backed by Model Center: the resolver decides whom to call, the
 * provider adapter how. Resolution errors are never retried; provider errors keep their own
 * retryable flag (rate limit, timeout, 5xx).
 */
@Injectable()
export class WorkerLlmClient implements LlmClient {
  constructor(
    private readonly resolver: RuntimeModelResolver,
    private readonly registry: ProviderRegistry,
  ) {}

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const model = await this.resolver.resolve(request.modelId);
    const provider = this.registry.get(model.provider);

    const result = await provider.generate({
      baseUrl: resolveProviderBaseUrl(model),
      apiKey: model.apiKey,
      model: model.modelName,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      // Some models reject the parameter; the node keeps its value for when the model changes.
      temperature: model.supportsTemperature ? request.temperature : undefined,
    });

    return { text: result.text, usage: result.usage };
  }
}

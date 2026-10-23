import { Injectable } from '@nestjs/common';
import { ProviderRegistry, resolveProviderBaseUrl, type ChatMessage, type ChatToolDefinition } from '@flowmind/shared';
import type { AgentChatPort, AgentModelResponse } from '@flowmind/workflow-core';
import { RuntimeModelResolver } from '../llm/runtime-model-resolver.js';

/** Adapter from core's provider-neutral Agent port to Model Center + an OpenAI-compatible provider. */
@Injectable()
export class WorkerAgentChatService implements AgentChatPort {
  constructor(private readonly resolver: RuntimeModelResolver, private readonly registry: ProviderRegistry) {}
  async generate(input: Parameters<AgentChatPort['generate']>[0]): Promise<AgentModelResponse> {
    const model = await this.resolver.resolveToolCallingChatModel(input.modelId);
    const provider = this.registry.get(model.provider);
    const result = await provider.generate({
      baseUrl: resolveProviderBaseUrl(model), apiKey: model.apiKey, model: model.modelName,
      messages: input.messages as ChatMessage[], tools: input.tools as ChatToolDefinition[],
      temperature: model.supportsTemperature ? input.temperature : undefined,
    });
    return { text: result.text, toolCalls: result.toolCalls };
  }
}

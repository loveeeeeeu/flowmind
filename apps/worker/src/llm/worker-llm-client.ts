import { Injectable } from '@nestjs/common';
import {
  WorkflowExecutionError,
  type LlmClient,
  type LlmGenerateRequest,
  type LlmGenerateResponse,
} from '@flowmind/workflow-core';
import type { CredentialProvider } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProviderRegistry } from './provider-registry.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider.js';

// TEMPORARY (Sprint 9 Lesson 3 -> 4): the model comes from Model Center, but the endpoint and
// secret still come from the env-configured registry entry for the credential's provider.
// Lesson 4 replaces this with decrypting the credential itself.
const LEGACY_PROVIDER_IDS: Record<CredentialProvider, string> = {
  OPENAI: 'openai',
  DEEPSEEK: 'deepseek',
  OPENAI_COMPATIBLE: 'custom',
};

function runError(code: string, message: string) {
  return new WorkflowExecutionError(message, { code, retryable: false });
}

/**
 * Resolves a node's modelId at call time. A disabled model still runs (published versions keep
 * working); a revoked credential never does.
 */
@Injectable()
export class WorkerLlmClient implements LlmClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly adapter: OpenAICompatibleProvider,
  ) {}

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    const model = await this.prisma.model.findUnique({
      where: { id: request.modelId },
      select: {
        modelName: true,
        supportsTemperature: true,
        credential: { select: { provider: true, revokedAt: true } },
      },
    });

    if (!model) {
      throw runError('MODEL_NOT_FOUND', `Model ${request.modelId} not found`);
    }

    if (model.credential.revokedAt) {
      throw runError('CREDENTIAL_REVOKED', `Credential for model ${request.modelId} is revoked`);
    }

    const provider = this.registry.get(LEGACY_PROVIDER_IDS[model.credential.provider]);
    const result = await this.adapter.generate(provider, {
      model: model.modelName,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      // Some models reject the parameter; the node keeps its value for when the model changes.
      temperature: model.supportsTemperature ? request.temperature : undefined,
    });

    return { text: result.text, usage: result.usage };
  }
}

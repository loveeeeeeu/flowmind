import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WORKFLOW_EXECUTION_QUEUE } from '@flowmind/shared';
import { createWorkflowEngine, WorkflowEngine } from '@flowmind/workflow-core';
import { fileURLToPath } from 'node:url';
import { CodeRunnerService } from './code/code-runner.service.js';
import { validateEnv } from './config/env.schema.js';
import { WorkflowExecutionService } from './execution/workflow-execution.service.js';
import { WorkflowRunProcessor } from './execution/workflow-run.processor.js';
import { ProviderRegistry } from './llm/provider-registry.js';
import { OpenAICompatibleProvider } from './llm/providers/openai-compatible.provider.js';
import { WorkerLlmClient } from './llm/worker-llm-client.js';
import { PrismaModule } from './prisma/prisma.module.js';

// apps/worker/.env wins; otherwise fall back to the API's .env so secrets live in one file locally.
const envFilePath = ['../.env', '../../api/.env'].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath, validate: validateEnv }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE }),
    PrismaModule,
  ],
  providers: [
    ProviderRegistry,
    OpenAICompatibleProvider,
    WorkerLlmClient,
    CodeRunnerService,
    {
      provide: WorkflowEngine,
      inject: [WorkerLlmClient, CodeRunnerService],
      useFactory: (llmClient: WorkerLlmClient, codeRunner: CodeRunnerService) =>
        createWorkflowEngine({ llmClient, codeRunner }),
    },
    WorkflowExecutionService,
    WorkflowRunProcessor,
  ],
})
export class WorkerModule {}

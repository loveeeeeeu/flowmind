import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CredentialCrypto,
  decodeMasterKey,
  OpenAICompatibleProvider,
  ProviderRegistry,
  WORKFLOW_EXECUTION_QUEUE,
} from '@flowmind/shared';
import { createWorkflowEngine, WorkflowEngine } from '@flowmind/workflow-core';
import { fileURLToPath } from 'node:url';
import { CodeRunnerService } from './code/code-runner.service.js';
import { validateEnv } from './config/env.schema.js';
import { ExecutionLogService } from './execution/execution-log.service.js';
import { ExecutionEventsModule } from './execution-events/execution-events.module.js';
import { RunRecoveryScheduler } from './execution/run-recovery.scheduler.js';
import { RunRecoveryService } from './execution/run-recovery.service.js';
import { RunStateService } from './execution/run-state.service.js';
import { WorkflowExecutionService } from './execution/workflow-execution.service.js';
import { WorkflowRunProcessor } from './execution/workflow-run.processor.js';
import { RuntimeModelResolver } from './llm/runtime-model-resolver.js';
import { WorkerLlmClient } from './llm/worker-llm-client.js';
import { PrismaModule } from './prisma/prisma.module.js';

// apps/worker/.env wins; otherwise fall back to the API's .env, which also guarantees both apps
// share the same CREDENTIAL_ENCRYPTION_KEY locally.
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
    ExecutionEventsModule,
  ],
  providers: [
    {
      provide: CredentialCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CredentialCrypto(decodeMasterKey(config.get<string>('CREDENTIAL_ENCRYPTION_KEY'))),
    },
    RuntimeModelResolver,
    {
      provide: ProviderRegistry,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new ProviderRegistry(
          new OpenAICompatibleProvider({ generateTimeoutMs: config.get<number>('LLM_TIMEOUT_MS') }),
        ),
    },
    WorkerLlmClient,
    CodeRunnerService,
    {
      provide: WorkflowEngine,
      inject: [WorkerLlmClient, CodeRunnerService],
      useFactory: (llmClient: WorkerLlmClient, codeRunner: CodeRunnerService) =>
        createWorkflowEngine({ llmClient, codeRunner }),
    },
    ExecutionLogService,
    RunStateService,
    RunRecoveryService,
    RunRecoveryScheduler,
    WorkflowExecutionService,
    WorkflowRunProcessor,
  ],
})
export class WorkerModule {}

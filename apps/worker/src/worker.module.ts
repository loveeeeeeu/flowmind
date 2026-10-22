import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CredentialCrypto,
  decodeMasterKey,
  OpenAICompatibleProvider,
  ProviderRegistry,
  KNOWLEDGE_INGESTION_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@flowmind/shared';
import { ToolExecutor, ToolRegistry } from '@flowmind/tool-runtime';
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
import { EmbeddingService } from './embedding/embedding.service.js';
import { KnowledgeEmbeddingService } from './knowledge/knowledge-embedding.service.js';
import { KnowledgeVectorService } from './knowledge/knowledge-vector.service.js';
import { DocumentTextExtractor } from './knowledge/document-text-extractor.service.js';
import { KnowledgeIngestionProcessor } from './knowledge/knowledge-ingestion.processor.js';
import { KnowledgeIngestionService } from './knowledge/knowledge-ingestion.service.js';
import { TextChunker } from './knowledge/text-chunker.service.js';
import { WorkflowKnowledgeRetrieverAdapter } from './knowledge/workflow-knowledge-retriever.adapter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { EchoTool } from './tools/echo.tool.js';
import { SearchKnowledgeTool } from './tools/search-knowledge.tool.js';

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
    BullModule.registerQueue({ name: KNOWLEDGE_INGESTION_QUEUE }),
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
    EmbeddingService,
    KnowledgeVectorService,
    KnowledgeEmbeddingService,
    DocumentTextExtractor,
    // These are value configuration parameters, not Nest dependencies. Registering the class
    // directly makes Nest try to inject Number/Object for its default constructor arguments.
    { provide: TextChunker, useFactory: () => new TextChunker() },
    KnowledgeIngestionService,
    KnowledgeIngestionProcessor,
    WorkflowKnowledgeRetrieverAdapter,
    EchoTool,
    {
      provide: SearchKnowledgeTool,
      inject: [WorkflowKnowledgeRetrieverAdapter],
      useFactory: (retriever: WorkflowKnowledgeRetrieverAdapter) => new SearchKnowledgeTool(retriever),
    },
    {
      provide: ToolRegistry,
      inject: [EchoTool, SearchKnowledgeTool],
      useFactory: (echo: EchoTool, searchKnowledge: SearchKnowledgeTool) => {
        const registry = new ToolRegistry();
        registry.register(echo);
        registry.register(searchKnowledge);
        return registry;
      },
    },
    {
      provide: ToolExecutor,
      inject: [ToolRegistry],
      useFactory: (registry: ToolRegistry) => new ToolExecutor(registry),
    },
    CodeRunnerService,
    {
      provide: WorkflowEngine,
      inject: [WorkerLlmClient, CodeRunnerService, WorkflowKnowledgeRetrieverAdapter],
      useFactory: (
        llmClient: WorkerLlmClient,
        codeRunner: CodeRunnerService,
        knowledgeRetriever: WorkflowKnowledgeRetrieverAdapter,
      ) => createWorkflowEngine({ llmClient, codeRunner, knowledgeRetriever }),
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

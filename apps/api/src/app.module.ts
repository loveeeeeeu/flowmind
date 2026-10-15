import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { LlmModule } from './llm/llm.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ExternalApiModule } from './external-api/external-api.module.js';
import { ApiKeyModule } from './api-key/api-key.module.js';
import { CredentialModule } from './credential/credential.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    HealthModule,
    LlmModule,
    WorkflowModule,
    ApiKeyModule,
    ExternalApiModule,
    CredentialModule,
  ],
})
export class AppModule {}

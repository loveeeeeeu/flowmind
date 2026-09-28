import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    WorkflowModule,
  ],
})
export class AppModule {}
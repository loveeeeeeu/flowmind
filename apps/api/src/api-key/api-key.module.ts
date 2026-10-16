import { Module } from '@nestjs/common';
import { ApiKeyController } from './api-key.controller.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeyService } from './api-key.service.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [ProjectModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}

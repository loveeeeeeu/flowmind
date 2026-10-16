import { Module } from '@nestjs/common';
import { CredentialModule } from '../credential/credential.module.js';
import { CredentialModelController, ModelController } from './model.controller.js';
import { ModelService } from './model.service.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [CredentialModule, ProjectModule],
  controllers: [CredentialModelController, ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}

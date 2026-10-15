import { Module } from '@nestjs/common';
import { CredentialModelController, ModelController } from './model.controller.js';
import { ModelService } from './model.service.js';

@Module({
  controllers: [CredentialModelController, ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}

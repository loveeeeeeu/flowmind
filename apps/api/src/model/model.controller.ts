import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateModelDto } from './dto/create-model.dto.js';
import { UpdateModelDto } from './dto/update-model.dto.js';
import { ModelService } from './model.service.js';

// Internal management API, like credentials. No response carries credential secrets.
@ApiTags('Models')
@Controller('credentials/:credentialId/models')
export class CredentialModelController {
  constructor(private readonly models: ModelService) {}

  @ApiOperation({ summary: 'Add a model to a credential' })
  @Post()
  create(@Param('credentialId') credentialId: string, @Body() dto: CreateModelDto) {
    return this.models.create(credentialId, dto);
  }

  @ApiOperation({ summary: "List a credential's models, disabled ones included (last)" })
  @Get()
  findByCredential(@Param('credentialId') credentialId: string) {
    return this.models.findByCredential(credentialId);
  }
}

@ApiTags('Models')
@Controller('models')
export class ModelController {
  constructor(private readonly models: ModelService) {}

  // Declared before ':id' so "available" is not taken as an id.
  @ApiOperation({ summary: 'Models selectable for new configuration (enabled, credential not revoked)' })
  @Get('available')
  findAvailable() {
    return this.models.findAvailable();
  }

  @ApiOperation({ summary: 'Get one model with its credential summary' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.models.findOne(id);
  }

  @ApiOperation({ summary: 'Update model metadata; modelName and credentialId are immutable' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.models.update(id, dto);
  }

  @ApiOperation({ summary: 'Disable a model (never deleted; published versions keep running)' })
  @ApiNoContentResponse({ description: 'Disabled' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@Param('id') id: string) {
    await this.models.disable(id);
  }
}

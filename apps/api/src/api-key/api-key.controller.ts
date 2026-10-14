import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';

// Internal management API: protected by user auth later (Sprint 10), not by API keys.
@ApiTags('API Keys')
@Controller('workflows/:workflowId/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @ApiOperation({ summary: 'Create an API key for a workflow' })
  @ApiCreatedResponse({ description: 'The raw key is returned only in this response' })
  @Post()
  create(@Param('workflowId') workflowId: string, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(workflowId, dto.name);
  }

  @ApiOperation({ summary: 'List the API keys of a workflow (never returns the key itself)' })
  @Get()
  list(@Param('workflowId') workflowId: string) {
    return this.apiKeys.list(workflowId);
  }

  @ApiOperation({ summary: 'Revoke an API key; it stops working immediately' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('workflowId') workflowId: string, @Param('keyId') keyId: string) {
    await this.apiKeys.revoke(workflowId, keyId);
  }
}

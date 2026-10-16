import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

// Internal management API: protected by user auth later (Sprint 10), not by API keys.
@ApiTags('API Keys')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/workflows/:workflowId/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @ApiOperation({ summary: 'Create an API key for a workflow' })
  @ApiCreatedResponse({ description: 'The raw key is returned only in this response' })
  @Post()
  create(@Param('projectId') projectId: string, @Param('workflowId') workflowId: string, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(projectId, workflowId, dto.name);
  }

  @ApiOperation({ summary: 'List the API keys of a workflow (never returns the key itself)' })
  @Get()
  list(@Param('projectId') projectId: string, @Param('workflowId') workflowId: string) {
    return this.apiKeys.list(projectId, workflowId);
  }

  @ApiOperation({ summary: 'Revoke an API key; it stops working immediately' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('projectId') projectId: string, @Param('workflowId') workflowId: string, @Param('keyId') keyId: string) {
    await this.apiKeys.revoke(projectId, workflowId, keyId);
  }
}

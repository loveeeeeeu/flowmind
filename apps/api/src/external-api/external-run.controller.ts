import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-key/api-key.guard.js';
import type { AuthenticatedApiKey } from '../api-key/api-key.types.js';
import { CurrentApiKey } from '../api-key/current-api-key.decorator.js';
import { ExternalRunService } from './external-run.service.js';

@ApiTags('External API v1')
@ApiBearerAuth('api-key')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked API key' })
@UseGuards(ApiKeyGuard)
@Controller('api/v1/runs')
export class ExternalRunController {
  constructor(private readonly service: ExternalRunService) {}

  @ApiOperation({ summary: 'Get the status and result of a run created through the external API' })
  @ApiOkResponse({ description: 'output is set on SUCCESS, error on FAILED, otherwise null' })
  @ApiForbiddenResponse({ description: 'The run belongs to a workflow this key cannot access' })
  @ApiNotFoundResponse({ description: 'Run not found' })
  @Get(':runId')
  findOne(@CurrentApiKey() apiKey: AuthenticatedApiKey, @Param('runId') runId: string) {
    return this.service.findOne(runId, apiKey);
  }
}

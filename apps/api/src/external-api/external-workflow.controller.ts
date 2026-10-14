import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-key/api-key.guard.js';
import type { AuthenticatedApiKey } from '../api-key/api-key.types.js';
import { CurrentApiKey } from '../api-key/current-api-key.decorator.js';
import { InvokeWorkflowDto } from './dto/invoke-workflow.dto.js';
import { ExternalWorkflowService } from './external-workflow.service.js';

@ApiTags('External API v1')
@ApiBearerAuth('api-key')
@ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked API key' })
@UseGuards(ApiKeyGuard)
@Controller('api/v1/workflows')
export class ExternalWorkflowController {
  constructor(private readonly service: ExternalWorkflowService) {}

  @ApiOperation({ summary: 'Run the latest published version of a workflow' })
  @ApiAcceptedResponse({ description: 'Run created and queued; poll GET /api/v1/runs/:runId' })
  @ApiBadRequestResponse({
    description: 'Invalid input, workflow archived, or no published version',
  })
  @ApiForbiddenResponse({ description: 'The API key belongs to another workflow' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @Post(':workflowId/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  invoke(
    @CurrentApiKey() apiKey: AuthenticatedApiKey,
    @Param('workflowId') workflowId: string,
    @Body() dto: InvokeWorkflowDto,
  ) {
    return this.service.invoke({ apiKey, workflowId, input: dto.input });
  }
}

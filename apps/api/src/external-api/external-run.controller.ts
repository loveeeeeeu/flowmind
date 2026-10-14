import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalRunService } from './external-run.service.js';

@ApiTags('External API v1')
@Controller('api/v1/runs')
export class ExternalRunController {
  constructor(private readonly service: ExternalRunService) {}

  @ApiOperation({ summary: 'Get the status and result of a run created through the external API' })
  @ApiOkResponse({ description: 'output is set on SUCCESS, error on FAILED, otherwise null' })
  @ApiNotFoundResponse({ description: 'Run not found' })
  @Get(':runId')
  findOne(@Param('runId') runId: string) {
    return this.service.findOne(runId);
  }
}

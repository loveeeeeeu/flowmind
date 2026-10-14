import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InvokeWorkflowDto } from './dto/invoke-workflow.dto.js';
import { ExternalWorkflowService } from './external-workflow.service.js';

// Local development only until API keys exist: do not expose to the public internet.
@ApiTags('External API v1')
@Controller('api/v1/workflows')
export class ExternalWorkflowController {
  constructor(private readonly service: ExternalWorkflowService) {}

  @ApiOperation({ summary: 'Run the latest published version of a workflow' })
  @ApiAcceptedResponse({ description: 'Run created and queued; poll GET /api/v1/runs/:runId' })
  @ApiBadRequestResponse({
    description: 'Invalid input, workflow archived, or no published version',
  })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @Post(':workflowId/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  invoke(@Param('workflowId') workflowId: string, @Body() dto: InvokeWorkflowDto) {
    return this.service.invoke(workflowId, dto.input);
  }
}

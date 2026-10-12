import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowRunService } from './workflow-run.service.js';

@ApiTags('Runs')
@Controller('runs')
export class RunController {
  constructor(private readonly runs: WorkflowRunService) {}

  @ApiOperation({ summary: 'Get a workflow run and its node runs' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const run = await this.runs.findOne(id);

    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }

    return run;
  }

  @ApiOperation({ summary: 'Get the execution logs of a workflow run (oldest first, max 500)' })
  @Get(':id/logs')
  async findLogs(@Param('id') id: string) {
    const logs = await this.runs.findLogs(id);

    if (!logs) {
      throw new NotFoundException(`Run ${id} not found`);
    }

    return logs;
  }
}

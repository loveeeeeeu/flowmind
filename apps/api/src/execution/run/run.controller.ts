import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { apiError } from '../../common/api-error.js';
import { WorkflowRunService } from './workflow-run.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../../project/project-role.guard.js';

@ApiTags('Runs')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/runs')
export class RunController {
  constructor(private readonly runs: WorkflowRunService) {}

  @ApiOperation({ summary: 'Get a workflow run and its node runs' })
  @Get(':id')
  async findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    const run = await this.runs.findOne(projectId, id);

    if (!run) {
      throw apiError.notFound('RUN_NOT_FOUND', `Run ${id} not found`);
    }

    return run;
  }

  @ApiOperation({ summary: 'Get sanitised debug data and logs for one node execution attempt' })
  @Get(':id/node-runs/:nodeRunId')
  findNodeRunDebug(
    @Param('projectId') projectId: string,
    @Param('id') runId: string,
    @Param('nodeRunId') nodeRunId: string,
  ) {
    return this.runs.findNodeRunDebug(projectId, runId, nodeRunId);
  }

  @ApiOperation({ summary: 'Get the execution logs of a workflow run (oldest first, max 500)' })
  @Get(':id/logs')
  async findLogs(@Param('projectId') projectId: string, @Param('id') id: string) {
    const logs = await this.runs.findLogs(projectId, id);

    if (!logs) {
      throw apiError.notFound('RUN_NOT_FOUND', `Run ${id} not found`);
    }

    return logs;
  }
}

import { Controller, MessageEvent, Param, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../../project/project-membership.guard.js';
import { RunEventStreamService } from './run-event-stream.service.js';

@ApiTags('Runs')
@ApiBearerAuth('user-jwt')
@ApiProduces('text/event-stream')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/runs')
export class RunEventsController {
  constructor(private readonly events: RunEventStreamService) {}

  @ApiOperation({ summary: 'Stream live events for an accessible workflow run' })
  @Sse(':runId/events')
  stream(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.events.stream(projectId, runId);
  }
}

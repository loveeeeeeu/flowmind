import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { McpConnectionService } from './mcp-connection.service.js';

/** Metadata-only picker endpoint. Tool execution remains in the Worker. */
@ApiTags('Tools')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/tools')
export class ProjectToolController {
  constructor(private readonly connections: McpConnectionService) {}
  @Get()
  list(@Param('projectId') projectId: string) { return this.connections.listProjectTools(projectId); }
}

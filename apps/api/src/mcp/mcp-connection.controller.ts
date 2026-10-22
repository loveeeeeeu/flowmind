import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { ProjectRoles } from '../project/project-roles.decorator.js';
import { CreateMcpConnectionDto, UpdateMcpConnectionDto } from './dto/mcp-connection.dto.js';
import { McpConnectionService } from './mcp-connection.service.js';

@ApiTags('MCP Connections')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/mcp-connections')
export class McpConnectionController {
  constructor(private readonly connections: McpConnectionService) {}
  @Get() findAll(@Param('projectId') projectId: string) { return this.connections.findAll(projectId); }
  @ProjectRoles('OWNER', 'EDITOR') @Post() create(@Param('projectId') projectId: string, @Body() dto: CreateMcpConnectionDto) { return this.connections.create(projectId, dto); }
  @Get(':id') findOne(@Param('projectId') projectId: string, @Param('id') id: string) { return this.connections.findOne(projectId, id); }
  @ProjectRoles('OWNER', 'EDITOR') @Patch(':id') update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateMcpConnectionDto) { return this.connections.update(projectId, id, dto); }
  @ProjectRoles('OWNER', 'EDITOR') @Post(':id/test') test(@Param('projectId') projectId: string, @Param('id') id: string) { return this.connections.test(projectId, id); }
  @ProjectRoles('OWNER', 'EDITOR') @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) @ApiNoContentResponse() async remove(@Param('projectId') projectId: string, @Param('id') id: string) { await this.connections.remove(projectId, id); }
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectService } from './project.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ProjectMembershipGuard } from './project-membership.guard.js';

// No DELETE on purpose: cascade deletion is too destructive for v1.
// Invite/role endpoints land in the RBAC lesson.
@ApiTags('Projects')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @ApiOperation({ summary: 'Create a new project (current user becomes OWNER)' })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @ApiOperation({ summary: "List the calling user's projects" })
  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.findMine(user.id);
  }

  @ApiOperation({ summary: 'Get one project (must be a member)' })
  @Get(':projectId')
  @UseGuards(ProjectMembershipGuard)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.projects.findOne(user.id, projectId);
  }
}

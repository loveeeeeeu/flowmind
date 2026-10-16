import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectService } from './project.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';

// No DELETE on purpose: cascade deletion is too destructive for v1.
// Invite/role endpoints land in the RBAC lesson.
@ApiTags('Projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @ApiOperation({ summary: 'Create a new project (current user becomes OWNER)' })
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @ApiOperation({ summary: "List the calling user's projects" })
  @Get()
  findMine() {
    return this.projects.findMine();
  }

  @ApiOperation({ summary: 'Get one project (must be a member)' })
  @Get(':projectId')
  findOne(@Param('projectId') projectId: string) {
    return this.projects.findOne(projectId);
  }
}

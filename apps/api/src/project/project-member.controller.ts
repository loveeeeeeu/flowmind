import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from './project-membership.guard.js';
import { ProjectRoleGuard } from './project-role.guard.js';
import { ProjectRoles } from './project-roles.decorator.js';
import { AddProjectMemberDto } from './dto/add-project-member.dto.js';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto.js';
import { ProjectMemberService } from './project-member.service.js';

@ApiTags('Project Members')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/members')
export class ProjectMemberController {
  constructor(private readonly members: ProjectMemberService) {}

  @ApiOperation({ summary: 'List members of the current project' })
  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.members.findAll(projectId);
  }

  @ApiOperation({ summary: 'Add an existing user to the project by email' })
  @ProjectRoles('OWNER')
  @Post()
  add(@Param('projectId') projectId: string, @Body() dto: AddProjectMemberDto) {
    return this.members.addMember(projectId, dto);
  }

  @ApiOperation({ summary: 'Change a project member role' })
  @ProjectRoles('OWNER')
  @Patch(':memberId')
  updateRole(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ) {
    return this.members.updateRole(projectId, memberId, dto);
  }

  @ApiOperation({ summary: 'Remove a project member' })
  @ApiNoContentResponse({ description: 'Member removed' })
  @ProjectRoles('OWNER')
  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('projectId') projectId: string, @Param('memberId') memberId: string) {
    await this.members.removeMember(projectId, memberId);
  }
}

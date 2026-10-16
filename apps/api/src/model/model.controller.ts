import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateModelDto } from './dto/create-model.dto.js';
import { ImportModelsDto } from './dto/import-models.dto.js';
import { UpdateModelDto } from './dto/update-model.dto.js';
import { ModelService } from './model.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { ProjectRoles } from '../project/project-roles.decorator.js';

// Credential-scoped model management: all routes inherit the credential's project.
@ApiTags('Models')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/credentials/:credentialId/models')
export class CredentialModelController {
  constructor(private readonly models: ModelService) {}

  @ApiOperation({ summary: 'Add a model to a credential' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post()
  create(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Body() dto: CreateModelDto,
  ) {
    return this.models.create(projectId, credentialId, dto);
  }

  @ApiOperation({
    summary: 'Import selected provider models (each modelName must be listed by GET /models now)',
  })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post('import')
  importModels(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Body() dto: ImportModelsDto,
  ) {
    return this.models.importModels(projectId, credentialId, dto);
  }

  @ApiOperation({ summary: "List a credential's models, disabled ones included (last)" })
  @Get()
  findByCredential(@Param('projectId') projectId: string, @Param('credentialId') credentialId: string) {
    return this.models.findByCredential(projectId, credentialId);
  }
}

// Global model read/write routes (non-credential-scoped ops).
@ApiTags('Models')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/models')
export class ModelController {
  constructor(private readonly models: ModelService) {}

  // Declared before ':id' so "available" is not taken as an id.
  @ApiOperation({ summary: 'Models selectable for new configuration (enabled, credential not revoked, in project)' })
  @Get('available')
  findAvailable(@Param('projectId') projectId: string) {
    return this.models.findAvailable(projectId);
  }

  @ApiOperation({ summary: 'Get one model with its credential summary' })
  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.models.findOne(projectId, id);
  }

  @ApiOperation({ summary: 'Update model metadata; modelName and credentialId are immutable' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Patch(':id')
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.models.update(projectId, id, dto);
  }

  @ApiOperation({ summary: 'Disable a model (never deleted; published versions keep running)' })
  @ApiNoContentResponse({ description: 'Disabled' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@Param('projectId') projectId: string, @Param('id') id: string) {
    await this.models.disable(projectId, id);
  }
}

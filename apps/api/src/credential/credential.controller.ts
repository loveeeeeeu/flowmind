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
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CredentialConnectionService } from './credential-connection.service.js';
import { CredentialService } from './credential.service.js';
import { CreateCredentialDto } from './dto/create-credential.dto.js';
import { UpdateCredentialDto } from './dto/update-credential.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { ProjectRoles } from '../project/project-roles.decorator.js';

// Internal management API: protected by user auth later (Sprint 10 Lesson 2). No endpoint returns
// the secret or its ciphertext; the service selects a whitelist of fields.
@ApiTags('Credentials')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/credentials')
export class CredentialController {
  constructor(
    private readonly credentials: CredentialService,
    private readonly connection: CredentialConnectionService,
  ) {}

  @ApiOperation({ summary: 'Create a provider credential (the secret is encrypted, never returned)' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateCredentialDto) {
    return this.credentials.create(projectId, dto);
  }

  @ApiOperation({ summary: 'List credentials for the project, including revoked ones' })
  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.credentials.findAll(projectId);
  }

  @ApiOperation({ summary: 'Get one credential (without its secret)' })
  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.credentials.findOne(projectId, id);
  }

  @ApiOperation({ summary: 'Update name / baseUrl; pass secret only to replace it' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCredentialDto,
  ) {
    return this.credentials.update(projectId, id, dto);
  }

  @ApiOperation({
    summary: 'Test the connection: GET {baseUrl}/models with the stored key, spends no tokens',
  })
  @ApiOkResponse({ description: '{ "ok": true }; failures are AUTH_ERROR / TIMEOUT / NETWORK_ERROR / ...' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.connection.test(projectId, id);
  }

  @ApiOperation({
    summary: "List the provider's models (read-only, nothing is saved); imported=true if already added",
  })
  @ProjectRoles('OWNER', 'EDITOR')
  @Get(':id/remote-models')
  listRemoteModels(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.connection.listRemoteModels(projectId, id);
  }

  @ApiOperation({ summary: 'Revoke a credential (soft delete); workflows using it will fail' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('projectId') projectId: string, @Param('id') id: string) {
    await this.credentials.revoke(projectId, id);
  }
}

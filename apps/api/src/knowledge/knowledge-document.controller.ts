import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { ProjectRoles } from '../project/project-roles.decorator.js';
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto.js';
import { KnowledgeDocumentService } from './knowledge-document.service.js';

@ApiTags('Knowledge Documents')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/knowledge-bases/:knowledgeBaseId/documents')
export class KnowledgeDocumentController {
  constructor(private readonly documents: KnowledgeDocumentService) {}

  @ApiOperation({ summary: 'Create a pending document and enqueue asynchronous ingestion' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string, @Body() dto: CreateKnowledgeDocumentDto) {
    return this.documents.create(projectId, knowledgeBaseId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string) {
    return this.documents.findAll(projectId, knowledgeBaseId);
  }

  @Get(':documentId')
  findOne(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string, @Param('documentId') documentId: string) {
    return this.documents.findOne(projectId, knowledgeBaseId, documentId);
  }

  @Get(':documentId/chunks')
  findChunks(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string, @Param('documentId') documentId: string) {
    return this.documents.findChunks(projectId, knowledgeBaseId, documentId);
  }

  @ProjectRoles('OWNER', 'EDITOR')
  @Post(':documentId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string, @Param('documentId') documentId: string) {
    await this.documents.retry(projectId, knowledgeBaseId, documentId);
  }

  @ProjectRoles('OWNER', 'EDITOR')
  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  async remove(@Param('projectId') projectId: string, @Param('knowledgeBaseId') knowledgeBaseId: string, @Param('documentId') documentId: string) {
    await this.documents.remove(projectId, knowledgeBaseId, documentId);
  }
}

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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectMembershipGuard } from '../project/project-membership.guard.js';
import { ProjectRoleGuard } from '../project/project-role.guard.js';
import { ProjectRoles } from '../project/project-roles.decorator.js';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto.js';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto.js';
import { KnowledgeRetrieverService } from './knowledge-retriever.service.js';
import { KnowledgeService } from './knowledge.service.js';

@ApiTags('Knowledge Bases')
@ApiBearerAuth('user-jwt')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, ProjectRoleGuard)
@Controller('projects/:projectId/knowledge-bases')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly retriever: KnowledgeRetrieverService,
  ) {}

  @ApiOperation({ summary: 'Create a project-scoped knowledge base' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledge.create(projectId, dto);
  }

  @ApiOperation({ summary: 'List knowledge bases in the current project' })
  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.knowledge.findAll(projectId);
  }

  @ApiOperation({ summary: 'Get one project-scoped knowledge base' })
  @Get(':knowledgeBaseId')
  findOne(@Param('projectId') projectId: string, @Param('knowledgeBaseId') id: string) {
    return this.knowledge.findOne(projectId, id);
  }

  @ApiOperation({ summary: 'Search READY document chunks in one knowledge base by cosine similarity' })
  @Post(':knowledgeBaseId/search')
  search(
    @Param('projectId') projectId: string,
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Body() dto: SearchKnowledgeDto,
  ) {
    return this.retriever.retrieve({
      projectId,
      knowledgeBaseId,
      query: dto.query,
      topK: dto.topK,
      minScore: dto.minScore,
    });
  }

  @ApiOperation({ summary: 'Update a knowledge base and its selected embedding model' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Patch(':knowledgeBaseId')
  update(
    @Param('projectId') projectId: string,
    @Param('knowledgeBaseId') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledge.update(projectId, id, dto);
  }

  @ApiOperation({ summary: 'Delete a knowledge base and cascade its documents and chunks' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ProjectRoles('OWNER', 'EDITOR')
  @Delete(':knowledgeBaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('projectId') projectId: string, @Param('knowledgeBaseId') id: string) {
    await this.knowledge.remove(projectId, id);
  }
}

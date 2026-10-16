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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service.js';
import { WorkflowVersionService } from './workflow-version.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { UpdateWorkflowDto } from './dto/update-workflow.dto.js';
import { QueryWorkflowDto } from './dto/query-workflow.dto.js';
import { UpdateWorkflowCanvasDto } from './dto/update-workflow-canvas.dto.js';
import { RunWorkflowDto } from '../execution/dto/run-workflow.dto.js';
import { TestWorkflowDto } from './dto/test-workflow.dto.js';

/**
 * All workflow management routes are scoped under a project.
 * The projectId param is threaded into every service call so queries are
 * naturally isolated — a workflow from another project always returns 404.
 */
@ApiTags('Workflows')
@Controller('projects/:projectId/workflows')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @ApiOperation({ summary: '创建工作流' })
  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflowService.create(projectId, dto);
  }

  @ApiOperation({ summary: '分页查询工作流列表' })
  @Get()
  findAll(@Param('projectId') projectId: string, @Query() query: QueryWorkflowDto) {
    return this.workflowService.findAll(projectId, query);
  }

  @ApiOperation({ summary: '查询工作流详情（含最新发布版本摘要 latestVersion）' })
  @Get(':id')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.workflowService.findDetail(projectId, id);
  }

  @ApiOperation({ summary: '更新工作流（只修改传入的字段）' })
  @Patch(':id')
  update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.update(projectId, id, dto);
  }

  @ApiOperation({ summary: '删除工作流' })
  @Delete(':id')
  remove(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.workflowService.remove(projectId, id);
  }

  @ApiOperation({ summary: '保存工作流草稿画布' })
  @Patch(':id/canvas')
  updateCanvas(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowCanvasDto,
  ) {
    return this.workflowService.updateCanvas(projectId, id, dto);
  }

  @ApiOperation({ summary: '校验工作流并生成执行顺序' })
  @Post(':id/validate')
  validate(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.workflowService.validateWorkflow(projectId, id);
  }

  @ApiOperation({ summary: '测试当前画布（可未保存）：生成 DRAFT 运行，不创建版本' })
  @Post(':id/test-run')
  @HttpCode(HttpStatus.ACCEPTED)
  testRun(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: TestWorkflowDto,
  ) {
    return this.workflowService.testRun(projectId, id, dto);
  }

  @ApiOperation({ summary: '发布已保存的草稿，生成新的不可变版本' })
  @Post(':id/publish')
  publish(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.workflowService.publish(projectId, id);
  }

  @ApiOperation({ summary: '运行最新发布版本（异步，返回 PENDING 的运行）' })
  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RunWorkflowDto,
  ) {
    return this.workflowService.runWorkflow(projectId, id, dto);
  }

  @ApiOperation({ summary: 'List workflow runs' })
  @Get(':id/runs')
  findRuns(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.workflowService.findRuns(projectId, id);
  }

  @ApiOperation({ summary: '查询工作流的发布版本（仅元数据，新版本在前）' })
  @Get(':id/versions')
  async findVersions(@Param('projectId') projectId: string, @Param('id') id: string) {
    await this.workflowService.findOne(projectId, id);

    return this.workflowVersionService.findByWorkflow(id);
  }

  @ApiOperation({ summary: '查询某个发布版本（含画布快照，只读）' })
  @Get(':id/versions/:versionId')
  async findVersion(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    // Verify the workflow belongs to the project before returning the version.
    await this.workflowService.findOne(projectId, id);
    return this.workflowVersionService.findOne(id, versionId);
  }
}

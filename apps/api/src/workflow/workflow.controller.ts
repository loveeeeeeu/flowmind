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

@ApiTags('Workflows')
@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @ApiOperation({ summary: '创建工作流' })
  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflowService.create(dto);
  }

  @ApiOperation({ summary: '分页查询工作流列表' })
  @Get()
  findAll(@Query() query: QueryWorkflowDto) {
    return this.workflowService.findAll(query);
  }

  @ApiOperation({ summary: '查询工作流详情（含最新发布版本摘要 latestVersion）' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowService.findDetail(id);
  }

  @ApiOperation({ summary: '更新工作流（只修改传入的字段）' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowService.update(id, dto);
  }

  @ApiOperation({ summary: '删除工作流' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowService.remove(id);
  }

  @ApiOperation({ summary: '保存工作流草稿画布' })
  @Patch(':id/canvas')
  updateCanvas(@Param('id') id: string, @Body() dto: UpdateWorkflowCanvasDto) {
    return this.workflowService.updateCanvas(id, dto);
  }

  @ApiOperation({ summary: '校验工作流并生成执行顺序' })
  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.workflowService.validateWorkflow(id);
  }

  @ApiOperation({ summary: '发布已保存的草稿，生成新的不可变版本' })
  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.workflowService.publish(id);
  }

  @ApiOperation({ summary: '运行最新发布版本（异步，返回 PENDING 的运行）' })
  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Param('id') id: string, @Body() dto: RunWorkflowDto) {
    return this.workflowService.runWorkflow(id, dto);
  }

  @ApiOperation({ summary: 'List workflow runs' })
  @Get(':id/runs')
  findRuns(@Param('id') id: string) {
    return this.workflowService.findRuns(id);
  }

  // Read-only on purpose: versions are immutable, so there is no PATCH or DELETE route.
  @ApiOperation({ summary: '查询工作流的发布版本（新版本在前）' })
  @Get(':id/versions')
  async findVersions(@Param('id') id: string) {
    await this.workflowService.findOne(id);

    return this.workflowVersionService.findByWorkflow(id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { UpdateWorkflowDto } from './dto/update-workflow.dto.js';
import { QueryWorkflowDto } from './dto/query-workflow.dto.js';
import { UpdateWorkflowCanvasDto } from './dto/update-workflow-canvas.dto.js';

@ApiTags('Workflows')
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

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

  @ApiOperation({ summary: '查询工作流详情' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowService.findOne(id);
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

  @ApiOperation({ summary: '保存工作流画布' })
  @Patch(':id/canvas')
  updateCanvas(@Param('id') id: string, @Body() dto: UpdateWorkflowCanvasDto) {
    return this.workflowService.updateCanvas(id, dto);
  }

  @ApiOperation({ summary: '校验工作流并生成执行顺序' })
  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.workflowService.validateWorkflow(id);
  }
}
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { UpdateWorkflowDto } from './dto/update-workflow.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryWorkflowDto } from './dto/query-workflow.dto.js';
import { UpdateWorkflowCanvasDto } from './dto/update-workflow-canvas.dto.js';
import { ExecutionService } from '../execution/execution.service.js';
import type { WorkflowCanvas } from '@flowmind/workflow-core';
import type { RunWorkflowDto } from '../execution/dto/run-workflow.dto.js';
import { WorkflowPlanService } from '../execution/workflow-plan.service.js';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly workflowPlanService: WorkflowPlanService,
  ) {}

  create(dto: CreateWorkflowDto) {
    return this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(query: QueryWorkflowDto) {
    const { page, pageSize, keyword } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.WorkflowWhereInput = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    await this.findOne(id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.workflow.delete({
      where: { id },
    });
  }

  /** Saving only touches the mutable draft; published versions are never rewritten. */
  async updateCanvas(id: string, dto: UpdateWorkflowCanvasDto) {
    await this.findOne(id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        draftCanvas: { nodes: dto.nodes, edges: dto.edges } as Prisma.InputJsonValue,
      },
    });
  }

  async validateWorkflow(id: string) {
    const workflow = await this.findOne(id);

    if (!workflow.draftCanvas) {
      throw new BadRequestException('Workflow has no draft canvas');
    }

    return this.workflowPlanService.createExecutionPlan(
      workflow.draftCanvas as unknown as WorkflowCanvas,
    );
  }

  // Still runs the draft until publishing exists (Sprint 8 Lesson 2 switches runs to versions).
  async runWorkflow(id: string, dto: RunWorkflowDto) {
    const workflow = await this.findOne(id);

    if (!workflow.draftCanvas) {
      throw new BadRequestException('Workflow has no draft canvas');
    }

    // Structural errors return 400 before a run exists; the worker still re-validates
    // because the draft may change between enqueue and execution.
    this.workflowPlanService.createExecutionPlan(
      workflow.draftCanvas as unknown as WorkflowCanvas,
    );

    return this.executionService.createRun({
      workflowId: workflow.id,
      input: dto.input,
    });
  }

  async findRuns(id: string) {
    await this.findOne(id);
    return this.executionService.findWorkflowRuns(id);
  }
}

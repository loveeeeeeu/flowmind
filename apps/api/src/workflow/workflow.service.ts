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
import { WorkflowVersionService } from './workflow-version.service.js';
import type { TestWorkflowDto } from './dto/test-workflow.dto.js';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly workflowPlanService: WorkflowPlanService,
    private readonly workflowVersionService: WorkflowVersionService,
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

  /** Detail for the editor: the draft plus a summary of the latest published version. */
  async findDetail(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, workflowId: true, version: true, draftRevision: true, createdAt: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    const { versions, ...rest } = workflow;

    return { ...rest, latestVersion: versions[0] ?? null };
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

  /**
   * Saving only touches the mutable draft; published versions are never rewritten. Every save
   * bumps the revision, even with an identical canvas: cheap, and never misses a change.
   */
  async updateCanvas(id: string, dto: UpdateWorkflowCanvasDto) {
    await this.findOne(id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        draftCanvas: { nodes: dto.nodes, edges: dto.edges } as Prisma.InputJsonValue,
        draftRevision: { increment: 1 },
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

  /**
   * Publishes the draft saved on the server (never a canvas sent by the client). Only static
   * structure is checked: publishing never executes nodes or calls external services.
   */
  async publish(id: string) {
    const workflow = await this.findOne(id);

    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Archived workflow cannot be published');
    }

    if (!workflow.draftCanvas) {
      throw new BadRequestException('Workflow has no draft canvas');
    }

    const canvas = workflow.draftCanvas as unknown as WorkflowCanvas;

    // Validated outside the transaction (pure CPU); the revision ties the result to this canvas.
    this.workflowPlanService.createExecutionPlan(canvas);

    return this.workflowVersionService.publish({
      workflowId: workflow.id,
      canvas,
      expectedDraftRevision: workflow.draftRevision,
    });
  }

  /**
   * Debug run of the editor's current canvas, saved or not. Creates a run with its own snapshot
   * and never a WorkflowVersion, so testing does not flood the version history.
   */
  async testRun(id: string, dto: TestWorkflowDto) {
    const workflow = await this.findOne(id);

    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Archived workflow cannot be tested');
    }

    const canvas = {
      nodes: dto.canvas.nodes,
      edges: dto.canvas.edges,
    } as unknown as WorkflowCanvas;

    // An invalid graph is rejected here instead of being queued just to fail in the worker.
    this.workflowPlanService.createExecutionPlan(canvas);

    return this.executionService.createDraftRun({
      workflowId: workflow.id,
      canvas,
      input: dto.input,
    });
  }

  /**
   * Binds the run to the latest published version at creation time, so later draft edits or
   * newer publishes never change what this run executes. The draft is never run here.
   */
  async runWorkflow(id: string, dto: RunWorkflowDto) {
    const workflow = await this.findOne(id);

    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Archived workflow cannot be run');
    }

    // The version row, not workflow.status, decides whether there is something to execute.
    const version = await this.workflowVersionService.findLatest(workflow.id);

    if (!version) {
      throw new BadRequestException('Workflow has no published version');
    }

    return this.executionService.createPublishedRun({
      workflowId: workflow.id,
      workflowVersionId: version.id,
      input: dto.input,
    });
  }

  async findRuns(id: string) {
    await this.findOne(id);
    return this.executionService.findWorkflowRuns(id);
  }
}

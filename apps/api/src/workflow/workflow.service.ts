import { Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
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
import { WorkflowResourceValidator } from './workflow-resource-validator.service.js';
import type { TestWorkflowDto } from './dto/test-workflow.dto.js';

type WorkflowRecord = Awaited<ReturnType<WorkflowService['findOne']>>;

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly workflowPlanService: WorkflowPlanService,
    private readonly workflowVersionService: WorkflowVersionService,
    private readonly resourceValidator: WorkflowResourceValidator,
  ) {}

  create(projectId: string, dto: CreateWorkflowDto) {
    return this.prisma.workflow.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(projectId: string, query: QueryWorkflowDto) {
    const { page, pageSize, keyword } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.WorkflowWhereInput = {
      projectId,
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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

  /**
   * Project-scoped lookup. Returns 404 if the workflow exists in another project
   * to avoid revealing that the id is valid — identical to "not found" from the
   * caller's perspective.
   */
  async findOne(projectId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, projectId },
    });

    if (!workflow) {
      throw apiError.notFound('WORKFLOW_NOT_FOUND', `Workflow ${id} not found`);
    }

    return workflow;
  }

  /** Detail for the editor: the draft plus a summary of the latest published version. */
  async findDetail(projectId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, projectId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, workflowId: true, version: true, draftRevision: true, createdAt: true },
        },
      },
    });

    if (!workflow) {
      throw apiError.notFound('WORKFLOW_NOT_FOUND', `Workflow ${id} not found`);
    }

    const { versions, ...rest } = workflow;

    return { ...rest, latestVersion: versions[0] ?? null };
  }

  async update(projectId: string, id: string, dto: UpdateWorkflowDto) {
    await this.findOne(projectId, id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async remove(projectId: string, id: string) {
    await this.findOne(projectId, id);

    return this.prisma.workflow.delete({
      where: { id },
    });
  }

  /**
   * Saving only touches the mutable draft; published versions are never rewritten. Every save
   * bumps the revision, even with an identical canvas: cheap, and never misses a change.
   */
  async updateCanvas(projectId: string, id: string, dto: UpdateWorkflowCanvasDto) {
    await this.findOne(projectId, id);

    return this.prisma.workflow.update({
      where: { id },
      data: {
        draftCanvas: { nodes: dto.nodes, edges: dto.edges } as Prisma.InputJsonValue,
        draftRevision: { increment: 1 },
      },
    });
  }

  async validateWorkflow(projectId: string, id: string) {
    const workflow = await this.findOne(projectId, id);

    if (!workflow.draftCanvas) {
      throw apiError.badRequest('WORKFLOW_DRAFT_MISSING', 'Workflow has no draft canvas');
    }

    return this.validateCanvas(projectId, workflow.draftCanvas as unknown as WorkflowCanvas);
  }

  /**
   * Publishes the draft saved on the server (never a canvas sent by the client). Checks structure
   * and referenced resources; publishing never executes nodes or calls external services.
   */
  async publish(projectId: string, id: string) {
    const workflow = await this.findOne(projectId, id);
    const canvas = this.ensurePublishable(workflow);

    // Validated outside the transaction; the revision ties the result to this canvas.
    await this.validateCanvas(projectId, canvas);

    return this.workflowVersionService.publishValidatedDraft({
      workflowId: workflow.id,
      canvas,
      expectedDraftRevision: workflow.draftRevision,
    });
  }

  /** Static rules first (pure, from workflow-core), then the resources they reference (database). */
  private async validateCanvas(projectId: string, canvas: WorkflowCanvas) {
    const plan = this.workflowPlanService.createExecutionPlan(canvas);
    await this.resourceValidator.validateForDraft(projectId, canvas);

    return plan;
  }

  private ensurePublishable(workflow: WorkflowRecord): WorkflowCanvas {
    if (workflow.status === 'ARCHIVED') {
      throw apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be published');
    }

    if (!workflow.draftCanvas) {
      throw apiError.badRequest('WORKFLOW_DRAFT_MISSING', 'Workflow has no draft canvas');
    }

    return workflow.draftCanvas as unknown as WorkflowCanvas;
  }

  /**
   * Debug run of the editor's current canvas, saved or not. Creates a run with its own snapshot
   * and never a WorkflowVersion, so testing does not flood the version history.
   */
  async testRun(projectId: string, id: string, dto: TestWorkflowDto) {
    const workflow = await this.findOne(projectId, id);

    if (workflow.status === 'ARCHIVED') {
      throw apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be tested');
    }

    const canvas = {
      nodes: dto.canvas.nodes,
      edges: dto.canvas.edges,
    } as unknown as WorkflowCanvas;

    // Rejected here (e.g. MODEL_DISABLED) instead of being queued just to fail in the worker.
    await this.validateCanvas(projectId, canvas);

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
  async runWorkflow(projectId: string, id: string, dto: RunWorkflowDto) {
    const workflow = await this.findOne(projectId, id);

    if (workflow.status === 'ARCHIVED') {
      throw apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be run');
    }

    // The version row, not workflow.status, decides whether there is something to execute.
    const version = await this.workflowVersionService.findLatest(workflow.id);

    if (!version) {
      throw apiError.badRequest('WORKFLOW_NOT_PUBLISHED', 'Workflow has no published version');
    }

    return this.executionService.createPublishedRun({
      workflowId: workflow.id,
      workflowVersionId: version.id,
      input: dto.input,
    });
  }

  async findRuns(projectId: string, id: string) {
    await this.findOne(projectId, id);
    return this.executionService.findWorkflowRuns(id);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedApiKey } from '../api-key/api-key.types.js';
import { ExecutionService } from '../execution/execution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ExternalRunAcceptedResponse } from './dto/external-run-response.dto.js';

export interface InvokeWorkflowParams {
  apiKey: AuthenticatedApiKey;
  workflowId: string;
  input: Record<string, unknown>;
}

/**
 * Another entry point into the same execution platform, not a second runtime: it only resolves
 * which published version to run, then hands over to ExecutionService like the editor does.
 * External callers can never run the draft or submit a canvas.
 */
@Injectable()
export class ExternalWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
  ) {}

  async invoke({
    apiKey,
    workflowId,
    input,
  }: InvokeWorkflowParams): Promise<ExternalRunAcceptedResponse> {
    // Checked before any lookup, so a key cannot probe which other workflows exist.
    if (apiKey.workflowId !== workflowId) {
      throw new ForbiddenException('API key cannot access this workflow');
    }

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: {
        id: true,
        status: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    if (workflow.status === 'ARCHIVED') {
      throw new BadRequestException('Archived workflow cannot be run');
    }

    const version = workflow.versions[0];

    if (!version) {
      throw new BadRequestException('Workflow has no published version');
    }

    const run = await this.executionService.createPublishedRun({
      workflowId: workflow.id,
      workflowVersionId: version.id,
      workflowApiKeyId: apiKey.id,
      input,
    });

    return {
      runId: run.id,
      workflowId: workflow.id,
      version: version.version,
      status: 'PENDING',
    };
  }
}

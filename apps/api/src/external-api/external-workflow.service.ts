import { Injectable } from '@nestjs/common';
import type { AuthenticatedApiKey } from '../api-key/api-key.types.js';
import { apiError } from '../common/api-error.js';
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
      throw apiError.forbidden('API_KEY_FORBIDDEN', 'API key cannot access this workflow');
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
      throw apiError.notFound('WORKFLOW_NOT_FOUND', `Workflow ${workflowId} not found`);
    }

    if (workflow.status === 'ARCHIVED') {
      throw apiError.badRequest('WORKFLOW_ARCHIVED', 'Archived workflow cannot be run');
    }

    const version = workflow.versions[0];

    if (!version) {
      throw apiError.badRequest('WORKFLOW_NOT_PUBLISHED', 'Workflow has no published version');
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

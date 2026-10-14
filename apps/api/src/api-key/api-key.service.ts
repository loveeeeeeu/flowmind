import { Injectable, Logger } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateApiKey, hashApiKey, hashesMatch, parseApiKeyPrefix } from './api-key.secret.js';
import type { AuthenticatedApiKey } from './api-key.types.js';

/** Never includes keyHash: clients have no use for it. */
const API_KEY_SUMMARY = {
  id: true,
  workflowId: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The only response that ever contains the raw key; the database keeps just its hash. */
  async create(workflowId: string, name: string) {
    await this.assertWorkflowExists(workflowId);

    const { prefix, key, keyHash } = generateApiKey();
    const record = await this.prisma.workflowApiKey.create({
      data: { workflowId, name, prefix, keyHash },
      select: API_KEY_SUMMARY,
    });

    return { ...record, key };
  }

  async list(workflowId: string) {
    await this.assertWorkflowExists(workflowId);

    return this.prisma.workflowApiKey.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: API_KEY_SUMMARY,
    });
  }

  /** Soft revoke: the row stays so runs keep pointing to the key that created them. */
  async revoke(workflowId: string, keyId: string) {
    const result = await this.prisma.workflowApiKey.updateMany({
      where: { id: keyId, workflowId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw apiError.notFound('API_KEY_NOT_FOUND', `API key ${keyId} not found`);
    }
  }

  /**
   * Authentication only: proves the caller holds a live key. Which workflow or run the key may
   * access is checked by the services that own those resources.
   */
  async verify(rawKey: string): Promise<AuthenticatedApiKey | null> {
    const prefix = parseApiKeyPrefix(rawKey);

    if (!prefix) {
      return null;
    }

    const record = await this.prisma.workflowApiKey.findUnique({
      where: { prefix },
      select: { id: true, workflowId: true, keyHash: true, revokedAt: true },
    });

    // Revoked keys are read on every request, so revocation applies immediately.
    if (!record || record.revokedAt || !hashesMatch(hashApiKey(rawKey), record.keyHash)) {
      return null;
    }

    this.touchLastUsed(record.id);

    return { id: record.id, workflowId: record.workflowId };
  }

  /** Metadata, not part of authentication: a failed write must not reject a valid request. */
  private touchLastUsed(id: string) {
    this.prisma.workflowApiKey
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to update lastUsedAt of API key ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private async assertWorkflowExists(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true },
    });

    if (!workflow) {
      throw apiError.notFound('WORKFLOW_NOT_FOUND', `Workflow ${workflowId} not found`);
    }
  }
}

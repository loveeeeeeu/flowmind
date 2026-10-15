import { Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateModelDto } from './dto/create-model.dto.js';
import type { UpdateModelDto } from './dto/update-model.dto.js';

export const MODEL_SUMMARY = {
  id: true,
  credentialId: true,
  name: true,
  modelName: true,
  type: true,
  contextWindow: true,
  supportsTemperature: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Never `include: { credential: true }`: that would pull the ciphertext into a response. */
export const MODEL_CREDENTIAL = {
  id: true,
  name: true,
  provider: true,
  baseUrl: true,
  revokedAt: true,
} as const;

/** What a model picker needs; disabled models and revoked credentials are already filtered out. */
export const AVAILABLE_MODEL = {
  id: true,
  name: true,
  modelName: true,
  type: true,
  contextWindow: true,
  supportsTemperature: true,
  credential: { select: { id: true, name: true, provider: true } },
} as const;

/**
 * Model.enabled controls whether a model can be picked for new configuration; Credential.revokedAt
 * controls whether anything using it can run. The two are independent: revoking a credential does
 * not touch its models, and disabling a model does not stop published versions that use it.
 */
@Injectable()
export class ModelService {
  constructor(private readonly prisma: PrismaService) {}

  async create(credentialId: string, dto: CreateModelDto) {
    await this.assertUsableCredential(credentialId);

    try {
      return await this.prisma.model.create({
        data: {
          credentialId,
          name: dto.name,
          modelName: dto.modelName,
          type: 'CHAT',
          contextWindow: dto.contextWindow,
          supportsTemperature: dto.supportsTemperature,
        },
        select: MODEL_SUMMARY,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw apiError.conflict(
          'MODEL_NAME_CONFLICT',
          `Model "${dto.modelName}" already exists for this credential`,
        );
      }

      throw error;
    }
  }

  /** Management view: disabled models included (listed last) so they can be re-enabled. */
  async findByCredential(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      select: { id: true },
    });

    if (!credential) {
      throw credentialNotFound(credentialId);
    }

    return this.prisma.model.findMany({
      where: { credentialId },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
      select: MODEL_SUMMARY,
    });
  }

  findAvailable() {
    return this.prisma.model.findMany({
      where: { enabled: true, credential: { revokedAt: null } },
      orderBy: [{ credential: { name: 'asc' } }, { name: 'asc' }],
      select: AVAILABLE_MODEL,
    });
  }

  async findOne(id: string) {
    const model = await this.prisma.model.findUnique({
      where: { id },
      select: { ...MODEL_SUMMARY, credential: { select: MODEL_CREDENTIAL } },
    });

    if (!model) {
      throw modelNotFound(id);
    }

    return model;
  }

  async update(id: string, dto: UpdateModelDto) {
    try {
      return await this.prisma.model.update({
        where: { id },
        data: {
          name: dto.name,
          contextWindow: dto.contextWindow,
          supportsTemperature: dto.supportsTemperature,
          enabled: dto.enabled,
        },
        select: MODEL_SUMMARY,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw modelNotFound(id);
      }

      throw error;
    }
  }

  /** Disable, never delete: published versions may still reference the id. */
  async disable(id: string) {
    const result = await this.prisma.model.updateMany({
      where: { id, enabled: true },
      data: { enabled: false },
    });

    if (result.count === 0) {
      throw apiError.notFound('MODEL_NOT_FOUND', `Model ${id} not found or already disabled`);
    }
  }

  private async assertUsableCredential(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      select: { revokedAt: true },
    });

    if (!credential) {
      throw credentialNotFound(credentialId);
    }

    if (credential.revokedAt) {
      throw apiError.badRequest('CREDENTIAL_REVOKED', 'Cannot add a model to a revoked credential');
    }
  }
}

function modelNotFound(id: string) {
  return apiError.notFound('MODEL_NOT_FOUND', `Model ${id} not found`);
}

function credentialNotFound(id: string) {
  return apiError.notFound('CREDENTIAL_NOT_FOUND', `Credential ${id} not found`);
}

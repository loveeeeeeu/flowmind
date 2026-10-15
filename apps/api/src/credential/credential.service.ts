import { Injectable } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import type { CredentialProvider } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import type { CreateCredentialDto } from './dto/create-credential.dto.js';
import type { UpdateCredentialDto } from './dto/update-credential.dto.js';

/**
 * Whitelist of what the API may return. Neither the secret nor its ciphertext, IV or auth tag:
 * every query here selects this instead of returning whole rows.
 */
const CREDENTIAL_SUMMARY = {
  id: true,
  name: true,
  provider: true,
  baseUrl: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Management only. Decrypting for a run is the worker's job (Sprint 9 Lesson 4). */
@Injectable()
export class CredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  /** Unlike workflow API keys nothing is shown once: the user already has the provider key. */
  async create(dto: CreateCredentialDto) {
    const baseUrl = dto.baseUrl ?? null;
    assertBaseUrl(dto.provider, baseUrl);

    return this.prisma.credential.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        baseUrl,
        ...this.crypto.encrypt(dto.secret),
      },
      select: CREDENTIAL_SUMMARY,
    });
  }

  /** Includes revoked credentials so the UI can explain why a version that uses one fails. */
  findAll() {
    return this.prisma.credential.findMany({
      orderBy: { createdAt: 'desc' },
      select: CREDENTIAL_SUMMARY,
    });
  }

  async findOne(id: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id },
      select: CREDENTIAL_SUMMARY,
    });

    if (!credential) {
      throw notFound(id);
    }

    return credential;
  }

  /** Omitted fields are kept. A new secret is encrypted and overwrites the old ciphertext unread. */
  async update(id: string, dto: UpdateCredentialDto) {
    const current = await this.prisma.credential.findUnique({
      where: { id },
      select: { provider: true, baseUrl: true, revokedAt: true },
    });

    if (!current) {
      throw notFound(id);
    }

    if (current.revokedAt) {
      throw apiError.badRequest('CREDENTIAL_REVOKED', 'Revoked credential cannot be updated');
    }

    assertBaseUrl(current.provider, dto.baseUrl === undefined ? current.baseUrl : dto.baseUrl);

    return this.prisma.credential.update({
      where: { id },
      data: {
        name: dto.name,
        baseUrl: dto.baseUrl,
        ...(dto.secret === undefined ? {} : this.crypto.encrypt(dto.secret)),
      },
      select: CREDENTIAL_SUMMARY,
    });
  }

  /**
   * Soft delete. Published versions keep the id in their canvas JSON (no foreign key can protect
   * it), so the row stays and runs can fail with CREDENTIAL_REVOKED instead of a dangling id.
   */
  async revoke(id: string) {
    const result = await this.prisma.credential.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw notFound(id);
    }
  }
}

function notFound(id: string) {
  return apiError.notFound('CREDENTIAL_NOT_FOUND', `Credential ${id} not found`);
}

/** OpenAI and DeepSeek fall back to their official endpoints; a compatible server has none. */
function assertBaseUrl(provider: CredentialProvider, baseUrl: string | null) {
  if (provider === 'OPENAI_COMPATIBLE' && !baseUrl) {
    throw apiError.badRequest(
      'CREDENTIAL_BASE_URL_REQUIRED',
      'Base URL is required for OpenAI-compatible credentials',
    );
  }
}

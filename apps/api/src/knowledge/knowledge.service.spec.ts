import { apiError } from '../common/api-error.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeService } from './knowledge.service.js';

function setup({
  knowledgeBase = { id: 'kb-1' } as { id: string } | null,
  embeddingModel = { id: 'embedding-1' } as { id: string } | null,
  deleteCount = 1,
  chunkCount = 0,
} = {}) {
  const prisma = {
    knowledgeBase: {
      create: vi.fn(async () => ({ id: 'kb-1' })),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => knowledgeBase),
      update: vi.fn(async () => ({ id: 'kb-1' })),
      deleteMany: vi.fn(async () => ({ count: deleteCount })),
    },
    model: {
      findFirst: vi.fn(async () => embeddingModel),
    },
    knowledgeChunk: {
      count: vi.fn(async () => chunkCount),
    },
    workflow: {
      findMany: vi.fn(async () => []),
    },
  };

  return { prisma, service: new KnowledgeService(prisma as unknown as PrismaService) };
}

describe('KnowledgeService', () => {
  it('creates a project-owned knowledge base without requiring an embedding model yet', async () => {
    const { service, prisma } = setup();

    await service.create('project-a', { name: 'Product docs', description: 'Support material' });

    expect(prisma.model.findFirst).not.toHaveBeenCalled();
    expect(prisma.knowledgeBase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        projectId: 'project-a',
        name: 'Product docs',
        description: 'Support material',
        embeddingModelId: undefined,
        embeddingDimensions: null,
      },
    }));
  });

  it('only accepts an enabled, same-project embedding model with a live credential', async () => {
    const { service, prisma } = setup();

    await service.create('project-a', { name: 'Docs', embeddingModelId: 'embedding-1' });

    expect(prisma.model.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'embedding-1',
        type: 'EMBEDDING',
        enabled: true,
        embeddingDimensions: { not: null },
        credential: { projectId: 'project-a', revokedAt: null },
      },
      select: { id: true, embeddingDimensions: true },
    });
  });

  it('hides CHAT, revoked, disabled, and cross-project models behind the same 404', async () => {
    const { service, prisma } = setup({ embeddingModel: null });

    await expect(service.create('project-a', { name: 'Docs', embeddingModelId: 'model-from-project-b' }))
      .rejects.toThrow(apiError.notFound('EMBEDDING_MODEL_NOT_FOUND', 'Embedding model not found'));
    expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
  });

  it('scopes each knowledge-base lookup to the requested project', async () => {
    const { service, prisma } = setup();

    await service.findOne('project-a', 'kb-1');

    expect(prisma.knowledgeBase.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'kb-1', projectId: 'project-a' },
    }));
  });

  it('returns a 404 instead of exposing a knowledge base from another project', async () => {
    const { service } = setup({ knowledgeBase: null });

    await expect(service.findOne('project-a', 'kb-from-project-b')).rejects.toThrow(
      apiError.notFound('KNOWLEDGE_BASE_NOT_FOUND', 'Knowledge base kb-from-project-b not found'),
    );
  });

  it('deletes only the matching project resource, letting database cascades remove documents and chunks', async () => {
    const { service, prisma } = setup();

    await service.remove('project-a', 'kb-1');

    expect(prisma.knowledgeBase.deleteMany).toHaveBeenCalledWith({
      where: { id: 'kb-1', projectId: 'project-a' },
    });
  });

  it('requires re-embedding instead of silently changing the model behind existing chunks', async () => {
    const knowledgeBase = { id: 'kb-1', embeddingModelId: 'embedding-old' };
    const { service, prisma } = setup({ knowledgeBase, chunkCount: 2 });

    await expect(service.update('project-a', 'kb-1', { embeddingModelId: 'embedding-new' }))
      .rejects.toThrow(apiError.conflict(
        'KNOWLEDGE_REEMBED_REQUIRED',
        'Cannot change the embedding model after chunks have been embedded; re-embed first',
      ));
    expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
  });

  it('returns 404 when a scoped delete changed no rows', async () => {
    const { service } = setup({ deleteCount: 0 });

    await expect(service.remove('project-a', 'kb-1')).rejects.toThrow(
      apiError.notFound('KNOWLEDGE_BASE_NOT_FOUND', 'Knowledge base kb-1 not found'),
    );
  });
});

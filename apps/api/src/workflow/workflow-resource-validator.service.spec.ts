import type { WorkflowCanvas } from '@flowmind/workflow-core';
import { apiError } from '../common/api-error.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowResourceValidator } from './workflow-resource-validator.service.js';

interface ModelRow {
  id: string;
  enabled: boolean;
  credential: { revokedAt: Date | null };
}

const usable = (id: string): ModelRow => ({ id, enabled: true, credential: { revokedAt: null } });

function setup(models: ModelRow[], knowledgeBases: Array<{ id: string; enabled: boolean; embeddingModelId: string | null; embeddingDimensions: number | null }> = []) {
  const prisma = {
    model: { findMany: vi.fn(async () => models) },
    knowledgeBase: { findMany: vi.fn(async () => knowledgeBases) },
  };
  const validator = new WorkflowResourceValidator(prisma as unknown as PrismaService);

  return { validator, prisma };
}

function canvas(...llmModelIds: string[]): WorkflowCanvas {
  return {
    nodes: [
      { id: 'start', type: 'start', data: {} },
      { id: 'tpl', type: 'template', data: { template: 'x', outputVariable: 'x' } },
      ...llmModelIds.map((modelId, index) => ({
        id: `llm-${index + 1}`,
        type: 'llm',
        data: { modelId, prompt: 'Hi', outputVariable: `a${index}` },
      })),
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [],
  };
}

describe('WorkflowResourceValidator.validateForDraft', () => {
  it('skips the database when there is no LLM node', async () => {
    const { validator, prisma } = setup([]);

    await validator.validateForDraft('project-1', canvas());

    expect(prisma.model.findMany).not.toHaveBeenCalled();
  });

  it('queries each referenced model once and accepts usable ones', async () => {
    const { validator, prisma } = setup([usable('model-a'), usable('model-b')]);

    await expect(validator.validateForDraft('project-1', canvas('model-a', 'model-b', 'model-a'))).resolves.toBeUndefined();

    expect(prisma.model.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.model.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['model-a', 'model-b'] }, credential: { projectId: 'project-1' } },
      select: { id: true, enabled: true, credential: { select: { revokedAt: true } } },
    });
  });

  it('rejects a model that does not exist', async () => {
    const { validator } = setup([usable('model-a')]);

    await expect(validator.validateForDraft('project-1', canvas('model-a', 'ghost'))).rejects.toThrow(
      apiError.badRequest('MODEL_NOT_FOUND', 'LLM node llm-2 references model ghost, which does not exist'),
    );
  });

  it('rejects a disabled model', async () => {
    const { validator } = setup([{ ...usable('model-a'), enabled: false }]);

    await expect(validator.validateForDraft('project-1', canvas('model-a'))).rejects.toThrow(
      apiError.badRequest('MODEL_DISABLED', 'LLM node llm-1 uses a disabled model; select another model'),
    );
  });

  it('rejects an enabled model whose credential is revoked', async () => {
    const { validator } = setup([{ ...usable('model-a'), credential: { revokedAt: new Date() } }]);

    await expect(validator.validateForDraft('project-1', canvas('model-a'))).rejects.toThrow(
      apiError.badRequest(
        'CREDENTIAL_REVOKED',
        'LLM node llm-1 uses a model whose credential is revoked; select another model',
      ),
    );
  });

  it('bulk validates Retriever knowledge bases inside the current project', async () => {
    const { validator, prisma } = setup([], [{ id: 'kb-1', enabled: true, embeddingModelId: 'embed-1', embeddingDimensions: 1536 }]);
    const retrieverCanvas: WorkflowCanvas = {
      nodes: [{ id: 'retriever', type: 'knowledgeRetriever', data: { knowledgeBaseId: 'kb-1', query: '{{input.question}}' } }],
      edges: [],
    };

    await expect(validator.validateForDraft('project-1', retrieverCanvas)).resolves.toBeUndefined();
    expect(prisma.knowledgeBase.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['kb-1'] }, projectId: 'project-1' },
      select: { id: true, enabled: true, embeddingModelId: true, embeddingDimensions: true },
    });
  });

  it('rejects a disabled or cross-project Retriever knowledge base before execution', async () => {
    const retrieverCanvas: WorkflowCanvas = {
      nodes: [{ id: 'retriever', type: 'knowledgeRetriever', data: { knowledgeBaseId: 'kb-1', query: 'question' } }],
      edges: [],
    };
    await expect(setup([], [{ id: 'kb-1', enabled: false, embeddingModelId: 'embed-1', embeddingDimensions: 2 }]).validator
      .validateForDraft('project-1', retrieverCanvas))
      .rejects.toThrow(apiError.badRequest('KNOWLEDGE_BASE_DISABLED', 'Retriever node retriever uses a disabled knowledge base'));
    await expect(setup([], []).validator.validateForDraft('project-1', retrieverCanvas))
      .rejects.toThrow(apiError.badRequest('KNOWLEDGE_BASE_NOT_FOUND', 'Retriever node retriever references knowledge base kb-1, which does not exist'));
  });
});

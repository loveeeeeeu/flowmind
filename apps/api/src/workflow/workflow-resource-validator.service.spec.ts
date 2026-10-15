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

function setup(models: ModelRow[]) {
  const prisma = { model: { findMany: vi.fn(async () => models) } };
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

    await validator.validateForDraft(canvas());

    expect(prisma.model.findMany).not.toHaveBeenCalled();
  });

  it('queries each referenced model once and accepts usable ones', async () => {
    const { validator, prisma } = setup([usable('model-a'), usable('model-b')]);

    await expect(validator.validateForDraft(canvas('model-a', 'model-b', 'model-a'))).resolves.toBeUndefined();

    expect(prisma.model.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.model.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['model-a', 'model-b'] } },
      select: { id: true, enabled: true, credential: { select: { revokedAt: true } } },
    });
  });

  it('rejects a model that does not exist', async () => {
    const { validator } = setup([usable('model-a')]);

    await expect(validator.validateForDraft(canvas('model-a', 'ghost'))).rejects.toThrow(
      apiError.badRequest('MODEL_NOT_FOUND', 'LLM node llm-2 references model ghost, which does not exist'),
    );
  });

  it('rejects a disabled model', async () => {
    const { validator } = setup([{ ...usable('model-a'), enabled: false }]);

    await expect(validator.validateForDraft(canvas('model-a'))).rejects.toThrow(
      apiError.badRequest('MODEL_DISABLED', 'LLM node llm-1 uses a disabled model; select another model'),
    );
  });

  it('rejects an enabled model whose credential is revoked', async () => {
    const { validator } = setup([{ ...usable('model-a'), credential: { revokedAt: new Date() } }]);

    await expect(validator.validateForDraft(canvas('model-a'))).rejects.toThrow(
      apiError.badRequest(
        'CREDENTIAL_REVOKED',
        'LLM node llm-1 uses a model whose credential is revoked; select another model',
      ),
    );
  });
});

import type { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeVectorService } from './knowledge-vector.service.js';

describe('KnowledgeVectorService', () => {
  it('uses parameterized raw SQL only after validating a finite, non-empty vector', async () => {
    const $executeRaw = vi.fn(async () => 1);
    const service = new KnowledgeVectorService({ $executeRaw } as unknown as PrismaService);

    await expect(service.writeEmbedding('chunk-1', [0.1, 0, -2])).resolves.toBeUndefined();
    expect($executeRaw).toHaveBeenCalledTimes(1);
    const [strings, vectorLiteral, chunkId] = $executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
      string,
    ];
    expect(strings).toHaveProperty('raw');
    expect(vectorLiteral).toBe('[0.1,0,-2]');
    expect(chunkId).toBe('chunk-1');

    await expect(service.writeEmbedding('chunk-1', [Number.NaN])).rejects.toMatchObject({
      code: 'INVALID_EMBEDDING_VECTOR', retryable: false,
    });
    expect($executeRaw).toHaveBeenCalledTimes(1);
  });
});

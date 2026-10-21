import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeVectorService } from './knowledge-vector.service.js';
import { DocumentTextExtractor } from './document-text-extractor.service.js';
import { KnowledgeIngestionError, normalizeKnowledgeError } from './knowledge-ingestion.error.js';
import { TextChunker, type TextChunk } from './text-chunker.service.js';

const MAX_DOCUMENT_CHUNKS = 1000;
const EMBEDDING_BATCH_SIZE = 32;

@Injectable()
export class KnowledgeIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: DocumentTextExtractor,
    private readonly chunker: TextChunker,
    private readonly embeddings: EmbeddingService,
    private readonly vectors: KnowledgeVectorService,
  ) {}

  async ingest(documentId: string): Promise<'processed' | 'skip'> {
    try {
      const document = await this.claimDocument(documentId);
      if (!document) return 'skip';
      // Retrying begins from a clean document. Partial chunks from a previous failed attempt are
      // intentionally retained until this point for debugging, but never visible to a READY-only retriever.
      await this.prisma.knowledgeChunk.deleteMany({ where: { documentId } });
      const chunks = this.chunker.chunk(this.extractor.extract(document).text);
      if (chunks.length === 0) throw new KnowledgeIngestionError('EMPTY_DOCUMENT', 'Document contains no indexable text');
      if (chunks.length > MAX_DOCUMENT_CHUNKS) {
        throw new KnowledgeIngestionError('DOCUMENT_TOO_LARGE', 'Document produces too many chunks');
      }

      await this.createChunks(documentId, chunks);
      await this.embedDocumentChunks(document.id, document.knowledgeBase.embeddingModelId!);
      await this.prisma.knowledgeDocument.updateMany({
        where: { id: documentId, status: 'PROCESSING' },
        data: { status: 'READY', errorCode: null, errorMessage: null },
      });
      return 'processed';
    } catch (error) {
      const normalized = normalizeKnowledgeError(error);
      await this.prisma.knowledgeDocument.updateMany({
        where: { id: documentId, status: 'PROCESSING' },
        data: { status: 'FAILED', errorCode: normalized.code, errorMessage: normalized.message },
      });
      throw error;
    }
  }

  private async claimDocument(documentId: string) {
    const claimed = await this.prisma.knowledgeDocument.updateMany({
      where: { id: documentId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PROCESSING', errorCode: null, errorMessage: null },
    });
    if (claimed.count !== 1) return null;

    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        sourceType: true,
        sourceText: true,
        knowledgeBase: { select: { embeddingModelId: true } },
      },
    });
    if (!document) return null;
    if (!document.knowledgeBase.embeddingModelId) {
      throw new KnowledgeIngestionError('KNOWLEDGE_EMBEDDING_MODEL_REQUIRED', 'Knowledge base requires an embedding model');
    }
    return document;
  }

  private createChunks(documentId: string, chunks: TextChunk[]) {
    return this.prisma.knowledgeChunk.createMany({
      data: chunks.map((chunk) => ({
        documentId,
        chunkIndex: chunk.index,
        content: chunk.content,
        metadata: { startOffset: chunk.startOffset, endOffset: chunk.endOffset },
      })),
    });
  }

  private async embedDocumentChunks(documentId: string, modelId: string) {
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { documentId }, orderBy: { chunkIndex: 'asc' }, select: { id: true, content: true },
    });
    for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
      const result = await this.embeddings.embed(modelId, batch.map((chunk) => chunk.content));
      for (let index = 0; index < batch.length; index += 1) {
        await this.vectors.writeEmbedding(batch[index].id, result.embeddings[index]);
      }
    }
  }
}

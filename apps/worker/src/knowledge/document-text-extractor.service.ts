import { Injectable } from '@nestjs/common';
import { KnowledgeIngestionError } from './knowledge-ingestion.error.js';

export interface ExtractedDocument {
  text: string;
  metadata?: { pageCount?: number };
}

/** Source abstraction: FILE parsing can later be added without changing chunking or embedding. */
@Injectable()
export class DocumentTextExtractor {
  extract(document: { sourceType: 'TEXT' | 'FILE'; sourceText: string | null }): ExtractedDocument {
    if (document.sourceType === 'TEXT') {
      const text = document.sourceText?.trim();
      if (!text) {
        throw new KnowledgeIngestionError('EMPTY_DOCUMENT', 'Document contains no indexable text');
      }
      return { text };
    }
    throw new KnowledgeIngestionError('FILE_EXTRACTION_NOT_IMPLEMENTED', 'FILE extraction is not implemented yet');
  }
}

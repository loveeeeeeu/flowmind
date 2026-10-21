export const KNOWLEDGE_INGESTION_QUEUE = 'knowledge-ingestion';
export const INGEST_DOCUMENT_JOB = 'ingest-document';

/** Keep BullMQ jobs tiny. Worker reads source, model and credentials fresh from the database. */
export interface KnowledgeIngestionJobData {
  documentId: string;
}

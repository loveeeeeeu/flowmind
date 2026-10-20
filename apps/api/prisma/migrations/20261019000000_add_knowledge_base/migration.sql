-- PostgreSQL extension types are not ordinary Prisma scalar types. Keep this migration explicit:
-- Prisma handles the surrounding tables while pgvector owns the `vector` column implementation.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE "ModelType" ADD VALUE 'EMBEDDING';

ALTER TABLE "Model" ADD COLUMN "embeddingDimensions" INTEGER;

CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "KnowledgeDocumentSourceType" AS ENUM ('TEXT', 'FILE');

CREATE TABLE "KnowledgeBase" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "embeddingModelId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeDocument" (
  "id" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceType" "KnowledgeDocumentSourceType" NOT NULL,
  "mimeType" TEXT,
  "originalFileName" TEXT,
  "storageKey" TEXT,
  "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "tokenCount" INTEGER,
  "metadata" JSONB,
  "embedding" vector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeChunk_documentId_chunkIndex_key" ON "KnowledgeChunk"("documentId", "chunkIndex");
CREATE INDEX "KnowledgeBase_projectId_idx" ON "KnowledgeBase"("projectId");
CREATE INDEX "KnowledgeBase_embeddingModelId_idx" ON "KnowledgeBase"("embeddingModelId");
CREATE INDEX "KnowledgeDocument_knowledgeBaseId_idx" ON "KnowledgeDocument"("knowledgeBaseId");
CREATE INDEX "KnowledgeDocument_status_idx" ON "KnowledgeDocument"("status");
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

ALTER TABLE "KnowledgeBase"
  ADD CONSTRAINT "KnowledgeBase_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeBase"
  ADD CONSTRAINT "KnowledgeBase_embeddingModelId_fkey"
  FOREIGN KEY ("embeddingModelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeDocument"
  ADD CONSTRAINT "KnowledgeDocument_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk"
  ADD CONSTRAINT "KnowledgeChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBase" ADD COLUMN "embeddingDimensions" INTEGER;

-- Existing knowledge bases were created before the snapshot existed. Their selected model is the
-- only reliable source for a backfill; null stays null for bases with no embedding model yet.
UPDATE "KnowledgeBase" AS kb
SET "embeddingDimensions" = m."embeddingDimensions"
FROM "Model" AS m
WHERE kb."embeddingModelId" = m."id";
